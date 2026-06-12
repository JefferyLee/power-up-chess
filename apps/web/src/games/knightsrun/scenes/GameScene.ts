// GameScene — the L-jump bridge runner.
//
// An endless 5-file chessboard bridge stretches upward. The knight
// advances ONLY by real knight moves: its forward L-targets glow, the
// kid taps one, the knight leaps (the whole point — burning the L
// pattern into muscle memory at speed). Behind, the bridge crumbles
// into the void on a ramping timer. Enemy rooks/bishops periodically
// telegraph an attack line across the bridge, then strike — standing
// on the line when it fires costs the shield, then the run.
//
// Pedagogy disguised as arcade: forward knight-move fluency, reading
// telegraphed piece attack ranges, and "fork" moments (landing where
// you attack two enemies at once) that wire tactic vocabulary in.
//
// Coordinates: rank 0 at world y = 0; higher ranks extend UPWARD
// (negative world y). The `board` container scrolls down as the
// knight climbs, keeping it anchored at KNIGHT_ANCHOR_Y.

import Phaser from 'phaser'
import { playSound } from '../../../sound/synth'
import {
  BOARD_X,
  COLLAPSE_RAMP_PER_S,
  COLLAPSE_SPEED_MAX,
  COLLAPSE_SPEED_START,
  COLLAPSE_START_DELAY_MS,
  FILES,
  KNIGHT_ANCHOR_Y,
  SCORE_FORK,
  SCORE_GOLD,
  SCORE_PAWN,
  SCORE_PIECE,
  SCORE_RANK,
  SQ,
  SWEEP_FIRST_MS,
  SWEEP_INTERVAL_MIN_MS,
  SWEEP_INTERVAL_START_MS,
  SWEEP_STRIKE_MS,
  SWEEP_TELEGRAPH_MIN_MS,
  SWEEP_TELEGRAPH_START_MS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../config'

type ItemKind = 'pawn' | 'bishop' | 'rook' | 'gold' | 'shield'

interface Cell {
  kind: 'stone' | 'gap'
  item: ItemKind | null
  itemObj: Phaser.GameObjects.GameObject | null
}

interface Row {
  rank: number
  cells: Cell[]
  container: Phaser.GameObjects.Container
}

interface Sweep {
  /** 'f,r' keys of every threatened cell. */
  cells: Set<string>
  state: 'telegraph' | 'strike'
  /** elapsed-ms timestamp when the current state ends. */
  until: number
  rects: Phaser.GameObjects.Rectangle[]
  icon: Phaser.GameObjects.Image
  hasHitKnight: boolean
}

const FORWARD_MOVES: ReadonlyArray<readonly [number, number]> = [
  [-1, 2], [1, 2], [-2, 1], [2, 1],
]
const KNIGHT_ATTACKS: ReadonlyArray<readonly [number, number]> = [
  [-1, 2], [1, 2], [-2, 1], [2, 1], [-1, -2], [1, -2], [-2, -1], [2, -1],
]

const ITEM_TEXTURE: Record<Exclude<ItemKind, 'shield'>, string> = {
  pawn: 'pawn-b',
  bishop: 'bishop-b',
  rook: 'rook-b',
  gold: 'gold',
}

export class GameScene extends Phaser.Scene {
  private board!: Phaser.GameObjects.Container
  private rows = new Map<number, Row>()
  private knight!: Phaser.GameObjects.Image
  private kFile = 2
  private kRank = 0
  private maxGenRank = -1
  private prevGapFile = -1

  private elapsed = 0
  private collapseProgress = 0
  private dead = false
  private moving = false
  private invulnUntil = 0

  private score = 0
  private ranks = 0
  private captures = 0
  private forks = 0
  private shields = 0

  private markers: Phaser.GameObjects.Image[] = []
  private sweeps: Sweep[] = []
  private nextSweepAt = SWEEP_FIRST_MS

  private scoreText!: Phaser.GameObjects.Text
  private shieldText!: Phaser.GameObjects.Text
  private voidRect!: Phaser.GameObjects.Rectangle
  private voidEdge!: Phaser.GameObjects.Rectangle

  constructor() {
    super('Game')
  }

  create(): void {
    // Reset all run state — scene instances are reused on "Run again".
    this.rows = new Map()
    this.kFile = 2
    this.kRank = 0
    this.maxGenRank = -1
    this.prevGapFile = -1
    this.elapsed = 0
    this.collapseProgress = 0
    this.dead = false
    this.moving = false
    this.invulnUntil = 0
    this.score = 0
    this.ranks = 0
    this.captures = 0
    this.forks = 0
    this.shields = 0
    this.markers = []
    this.sweeps = []
    this.nextSweepAt = SWEEP_FIRST_MS

    this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x171026).setOrigin(0, 0)

    this.board = this.add.container(0, this.cameraTargetY())

    for (let r = 0; r <= 9; r++) this.spawnRow(r)

    this.knight = this.add
      .image(this.cellX(this.kFile), this.worldY(this.kRank), 'knight-w')
      .setDisplaySize(SQ * 0.86, SQ * 0.86)
      .setDepth(10)
    this.board.add(this.knight)

    // The void — covers everything below the collapse line.
    this.voidRect = this.add
      .rectangle(0, 0, WORLD_WIDTH, 4000, 0x0a0614, 0.94)
      .setOrigin(0, 0)
      .setDepth(20)
    this.voidEdge = this.add
      .rectangle(0, 0, WORLD_WIDTH, 5, 0xf6a23d, 0.8)
      .setOrigin(0, 0)
      .setDepth(21)
    this.board.add([this.voidRect, this.voidEdge])

    // HUD — fixed to the screen, not the scrolling board.
    this.scoreText = this.add
      .text(WORLD_WIDTH / 2, 26, '0', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '34px',
        color: '#f4c266',
      })
      .setOrigin(0.5, 0)
      .setDepth(100)
    this.shieldText = this.add
      .text(WORLD_WIDTH - 18, 30, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
      })
      .setOrigin(1, 0)
      .setDepth(100)

    this.add
      .text(WORLD_WIDTH / 2, 72, 'Leap like a knight — tap a glowing square!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#bcb4d0',
      })
      .setOrigin(0.5, 0)
      .setDepth(100)
      .setAlpha(0.9)

    this.showTargets()
  }

  // ── Coordinate helpers ──────────────────────────────────────────

  private cellX(file: number): number {
    return BOARD_X + file * SQ + SQ / 2
  }

  /** World y of a rank's square centre (rank 0 at 0, climbing = -y). */
  private worldY(rank: number): number {
    return -rank * SQ
  }

  private cameraTargetY(): number {
    return WORLD_HEIGHT * KNIGHT_ANCHOR_Y + this.kRank * SQ
  }

  private collapseWorldY(): number {
    return SQ * 1.5 - this.collapseProgress
  }

  private cellAt(file: number, rank: number): Cell | null {
    if (file < 0 || file >= FILES) return null
    return this.rows.get(rank)?.cells[file] ?? null
  }

  // ── Bridge generation ───────────────────────────────────────────

  private spawnRow(rank: number): void {
    if (this.rows.has(rank)) return
    this.maxGenRank = Math.max(this.maxGenRank, rank)
    const container = this.add.container(0, this.worldY(rank))
    this.board.addAt(container, 0) // squares render under knight/markers

    const cells: Cell[] = []
    // One gap max per row, never two rows running in the same file —
    // plus the self-heal in showTargets() this keeps the bridge passable.
    let gapFile = -1
    if (rank > 2) {
      const gapChance = Math.min(0.32, 0.1 + rank * 0.004)
      if (Math.random() < gapChance) {
        do {
          gapFile = Math.floor(Math.random() * FILES)
        } while (gapFile === this.prevGapFile)
      }
    }
    this.prevGapFile = gapFile

    let itemsInRow = 0
    for (let f = 0; f < FILES; f++) {
      if (f === gapFile) {
        cells.push({ kind: 'gap', item: null, itemObj: null })
        continue
      }
      const dark = (f + rank) % 2 === 1
      const sq = this.add.image(this.cellX(f), 0, dark ? 'sq-dark' : 'sq-light')
      container.add(sq)

      let item: ItemKind | null = null
      if (rank > 1 && itemsInRow < 2) {
        const roll = Math.random()
        if (roll < 0.16) item = 'pawn'
        else if (roll < 0.23) item = Math.random() < 0.5 ? 'bishop' : 'rook'
        else if (roll < 0.28) item = 'gold'
        else if (roll < 0.3 && rank > 6) item = 'shield'
      }
      let itemObj: Phaser.GameObjects.GameObject | null = null
      if (item) {
        itemsInRow++
        if (item === 'shield') {
          itemObj = this.add
            .text(this.cellX(f), 0, '🛡', { fontSize: '40px' })
            .setOrigin(0.5)
        } else {
          const size = item === 'gold' ? SQ * 0.42 : SQ * 0.66
          itemObj = this.add
            .image(this.cellX(f), 0, ITEM_TEXTURE[item])
            .setDisplaySize(size, size)
        }
        container.add(itemObj)
      }
      cells.push({ kind: 'stone', item, itemObj })
    }
    this.rows.set(rank, { rank, cells, container })
  }

  private ensureGenerated(): void {
    while (this.maxGenRank < this.kRank + 10) this.spawnRow(this.maxGenRank + 1)
  }

  // ── Move targets ────────────────────────────────────────────────

  private clearMarkers(): void {
    for (const m of this.markers) m.destroy()
    this.markers = []
  }

  private showTargets(): void {
    this.clearMarkers()
    if (this.dead) return

    let targets = this.legalTargets()
    if (targets.length === 0) {
      // Self-heal: never strand the knight — restore one target square.
      for (const [df, dr] of FORWARD_MOVES) {
        const f = this.kFile + df
        const r = this.kRank + dr
        if (f < 0 || f >= FILES) continue
        const cell = this.cellAt(f, r)
        if (cell && cell.kind === 'gap') {
          cell.kind = 'stone'
          const row = this.rows.get(r)!
          const dark = (f + r) % 2 === 1
          const sq = this.add.image(this.cellX(f), 0, dark ? 'sq-dark' : 'sq-light')
          row.container.addAt(sq, 0)
          break
        }
      }
      targets = this.legalTargets()
    }

    for (const [f, r] of targets) {
      const marker = this.add
        .image(this.cellX(f), this.worldY(r), 'target')
        .setDepth(5)
        .setInteractive({ useHandCursor: true })
      marker.on('pointerdown', () => this.hop(f, r))
      this.tweens.add({
        targets: marker,
        scale: { from: 0.86, to: 1.04 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.board.add(marker)
      this.markers.push(marker)
    }
  }

  private legalTargets(): Array<[number, number]> {
    const out: Array<[number, number]> = []
    for (const [df, dr] of FORWARD_MOVES) {
      const f = this.kFile + df
      const r = this.kRank + dr
      const cell = this.cellAt(f, r)
      if (cell && cell.kind === 'stone') out.push([f, r])
    }
    return out
  }

  // ── The leap ────────────────────────────────────────────────────

  private hop(file: number, rank: number): void {
    if (this.moving || this.dead) return
    this.moving = true
    this.clearMarkers()
    playSound('knight-jump')

    const gained = rank - this.kRank
    this.kFile = file
    this.kRank = rank

    this.tweens.add({
      targets: this.knight,
      x: this.cellX(file),
      y: this.worldY(rank),
      duration: 240,
      ease: 'Quad.easeInOut',
      onComplete: () => this.land(gained),
    })
    // Hop "arc" — scale swell halfway through the leap.
    this.tweens.add({
      targets: this.knight,
      displayWidth: SQ * 1.12,
      displayHeight: SQ * 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: this.board,
      y: this.cameraTargetY(),
      duration: 300,
      ease: 'Quad.easeOut',
    })
  }

  private land(ranksGained: number): void {
    this.ranks += ranksGained
    this.addScore(ranksGained * SCORE_RANK, null)

    const cell = this.cellAt(this.kFile, this.kRank)
    if (cell?.item) this.collectItem(cell)
    this.checkFork()

    this.ensureGenerated()
    this.moving = false
    this.showTargets()
  }

  private collectItem(cell: Cell): void {
    const item = cell.item!
    cell.item = null
    cell.itemObj?.destroy()
    cell.itemObj = null
    const x = this.cellX(this.kFile)
    const y = this.worldY(this.kRank)
    switch (item) {
      case 'pawn':
        this.captures++
        this.addScore(SCORE_PAWN, [x, y, `+${SCORE_PAWN}`])
        playSound('capture')
        break
      case 'bishop':
      case 'rook':
        this.captures++
        this.addScore(SCORE_PIECE, [x, y, `+${SCORE_PIECE}`])
        playSound('capture')
        break
      case 'gold':
        this.addScore(SCORE_GOLD, [x, y, `+${SCORE_GOLD}`])
        playSound('knight-coin')
        break
      case 'shield':
        this.shields = 1
        this.floatText(x, y, '🛡 Shield!', '#9fd6ff')
        playSound('small-solve')
        break
    }
  }

  /** Landing where you attack ≥2 enemy pieces = a FORK — the game's
   *  signature teaching moment. */
  private checkFork(): void {
    let attacked = 0
    for (const [df, dr] of KNIGHT_ATTACKS) {
      const cell = this.cellAt(this.kFile + df, this.kRank + dr)
      if (cell?.item === 'pawn' || cell?.item === 'bishop' || cell?.item === 'rook') attacked++
    }
    if (attacked >= 2) {
      this.forks++
      this.addScore(SCORE_FORK, null)
      this.banner(`FORK! +${SCORE_FORK}`)
      playSound('streak')
    }
  }

  // ── Sweeps ──────────────────────────────────────────────────────

  private spawnSweep(): void {
    const isRook = Math.random() < 0.55
    const cells = new Set<string>()
    let iconX = 0
    let iconY = 0
    let iconKey = 'rook-b'

    if (isRook) {
      const rank = this.kRank + 1 + Math.floor(Math.random() * 3)
      for (let f = 0; f < FILES; f++) cells.add(`${f},${rank}`)
      iconX = BOARD_X - SQ * 0.45
      iconY = this.worldY(rank)
    } else {
      iconKey = 'bishop-b'
      const dir = Math.random() < 0.5 ? 1 : -1
      const anchorFile = this.kFile
      const anchorRank = this.kRank + 1 + Math.floor(Math.random() * 2)
      for (let d = -6; d <= 6; d++) {
        const f = anchorFile + d * dir
        const r = anchorRank + d
        if (f >= 0 && f < FILES && r > this.kRank - 2) cells.add(`${f},${r}`)
      }
      iconX = this.cellX(anchorFile)
      iconY = this.worldY(anchorRank)
    }

    const telegraphMs = Math.max(
      SWEEP_TELEGRAPH_MIN_MS,
      SWEEP_TELEGRAPH_START_MS - this.kRank * 4,
    )
    const rects: Phaser.GameObjects.Rectangle[] = []
    for (const key of cells) {
      const [f, r] = key.split(',').map(Number) as [number, number]
      const rect = this.add
        .rectangle(this.cellX(f), this.worldY(r), SQ - 6, SQ - 6, 0xe05a4a, 0.26)
        .setDepth(6)
      this.board.add(rect)
      this.tweens.add({
        targets: rect,
        fillAlpha: 0.45,
        duration: 300,
        yoyo: true,
        repeat: -1,
      })
      rects.push(rect)
    }
    const icon = this.add
      .image(iconX, iconY, iconKey)
      .setDisplaySize(SQ * 0.6, SQ * 0.6)
      .setDepth(7)
      .setAlpha(0.9)
    this.board.add(icon)

    this.sweeps.push({
      cells,
      state: 'telegraph',
      until: this.elapsed + telegraphMs,
      rects,
      icon,
      hasHitKnight: false,
    })
  }

  private updateSweeps(): void {
    for (const s of [...this.sweeps]) {
      if (s.state === 'telegraph' && this.elapsed >= s.until) {
        s.state = 'strike'
        s.until = this.elapsed + SWEEP_STRIKE_MS
        for (const rect of s.rects) {
          this.tweens.killTweensOf(rect)
          rect.setFillStyle(0xff7a4a, 0.85)
        }
        playSound('check')
      }
      if (s.state === 'strike') {
        if (
          !s.hasHitKnight &&
          !this.moving &&
          s.cells.has(`${this.kFile},${this.kRank}`) &&
          this.elapsed >= this.invulnUntil
        ) {
          s.hasHitKnight = true
          this.hitKnight()
        }
        if (this.elapsed >= s.until) {
          for (const rect of s.rects) rect.destroy()
          s.icon.destroy()
          this.sweeps.splice(this.sweeps.indexOf(s), 1)
        }
      }
    }
  }

  private hitKnight(): void {
    if (this.dead) return
    if (this.shields > 0) {
      this.shields = 0
      this.invulnUntil = this.elapsed + 1200
      playSound('knight-hit')
      this.banner('Shield broke!')
      // Quick blink — Phaser 4 dropped the v3 tint-flash API.
      this.tweens.add({ targets: this.knight, alpha: 0.25, duration: 90, yoyo: true, repeat: 2 })
      return
    }
    this.die()
  }

  // ── Death ───────────────────────────────────────────────────────

  private die(): void {
    if (this.dead) return
    this.dead = true
    this.clearMarkers()
    playSound('mate-loss')
    this.tweens.add({
      targets: this.knight,
      y: this.knight.y + 180,
      angle: 140,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeIn',
    })
    this.time.delayedCall(800, () => {
      this.scene.start('GameOver', {
        ranks: this.ranks,
        captures: this.captures,
        forks: this.forks,
        score: this.score,
      })
    })
  }

  // ── Per-frame ───────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    if (this.dead) return
    this.elapsed += delta

    // Collapse ramp.
    if (this.elapsed > COLLAPSE_START_DELAY_MS) {
      const t = (this.elapsed - COLLAPSE_START_DELAY_MS) / 1000
      const speed = Math.min(COLLAPSE_SPEED_MAX, COLLAPSE_SPEED_START + COLLAPSE_RAMP_PER_S * t)
      this.collapseProgress += (speed * delta) / 1000
    }
    const voidY = this.collapseWorldY()
    this.voidRect.setY(voidY)
    this.voidEdge.setY(voidY - 2)

    // Crumble rows the void has swallowed.
    for (const row of [...this.rows.values()]) {
      if (this.worldY(row.rank) + SQ / 2 >= voidY) {
        this.rows.delete(row.rank)
        this.tweens.add({
          targets: row.container,
          y: row.container.y + 70,
          alpha: 0,
          duration: 450,
          ease: 'Quad.easeIn',
          onComplete: () => row.container.destroy(),
        })
      }
    }

    // The void catches the knight.
    if (!this.moving && this.worldY(this.kRank) + SQ * 0.45 >= voidY) {
      this.die()
      return
    }

    // Sweeps.
    if (this.elapsed >= this.nextSweepAt) {
      this.spawnSweep()
      const interval = Math.max(
        SWEEP_INTERVAL_MIN_MS,
        SWEEP_INTERVAL_START_MS - this.kRank * 18,
      )
      this.nextSweepAt = this.elapsed + interval
    }
    this.updateSweeps()

    this.shieldText.setText(this.shields > 0 ? '🛡' : '')
  }

  // ── Feedback helpers ────────────────────────────────────────────

  private addScore(points: number, float: [number, number, string] | null): void {
    this.score += points
    this.scoreText.setText(`${this.score}`)
    if (float) this.floatText(float[0], float[1], float[2], '#ffd860')
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y - SQ * 0.4, text, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '22px',
        color,
        stroke: '#1a1108',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30)
    this.board.add(t)
    this.tweens.add({
      targets: t,
      y: t.y - 56,
      alpha: 0,
      duration: 850,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  private banner(text: string): void {
    const b = this.add
      .text(WORLD_WIDTH / 2, WORLD_HEIGHT * 0.34, text, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '40px',
        color: '#ffd860',
        stroke: '#3a2010',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setScale(0.6)
    this.tweens.add({
      targets: b,
      scale: 1,
      duration: 220,
      ease: 'Back.Out',
    })
    this.tweens.add({
      targets: b,
      alpha: 0,
      y: b.y - 30,
      delay: 700,
      duration: 400,
      onComplete: () => b.destroy(),
    })
  }
}
