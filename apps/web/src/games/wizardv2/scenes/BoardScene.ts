// BoardScene — the canvas half of Wizard V2 M0.
//
// Read-only renderer driven by the React route. The route owns the
// useWizardRoom subscription and pushes two values into the Phaser
// registry on every state update:
//
//   - 'fen'          : current FEN (snapshot truth)
//   - 'lastAction'   : the most recent action record, or null
//
// The scene's create() builds the board, parses the initial FEN into
// piece sprites, and listens for 'changedata' on each key. When FEN
// changes, the scene reconciles by diffing pieces — if a move is
// detectable, animate it (slide for ordinary moves, lunge + fade for
// captures). Otherwise (the rare unexpected resync), it teleports
// everything to the new FEN silently.

import Phaser from 'phaser'
import {
  BOARD_MARGIN,
  BOARD_SIZE,
  CAPTURE_FADE_MS,
  CAPTURE_LUNGE_OVERSHOOT,
  DUST_PARTICLE_COUNT,
  LAST_MOVE_ALPHA,
  LAST_MOVE_TINT,
  MOVE_TWEEN_MS,
  SQ_DARK,
  SQ_LIGHT,
  TILE,
} from '../config'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
type FileCh = typeof FILES[number]
type Square = `${FileCh}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`

interface PieceState {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b'
  image: Phaser.GameObjects.Image
  square: Square
}

interface LastAction {
  kind: 'move'
  from: string
  to: string
  color: 'w' | 'b'
  piece: string
  captured?: string
}

export class BoardScene extends Phaser.Scene {
  /** Pieces by current square. Updated by reconcile() after animations finish
   *  for moves, or immediately for teleport resyncs. */
  private piecesBySquare = new Map<Square, PieceState>()
  /** Whose orientation are we rendering for. White at bottom by default;
   *  flipped if the local viewer is black. */
  private flipped = false
  /** Last applied FEN — drives the diff for the next reconcile. */
  private lastFen: string | null = null
  /** Highlight overlays for the last-touched squares (from + to). */
  private lastMoveHighlights: Phaser.GameObjects.Rectangle[] = []

  constructor() {
    super('Board')
  }

  preload(): void {
    // Stone piece set — kid's pick. Loaded from /public/sprites/stone/ so
    // these aren't bundled into the main JS chunk.
    const KEYS = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'] as const
    for (const k of KEYS) {
      this.load.image(`stone-${k}`, `/sprites/stone/${k}.png`)
    }
  }

  create(): void {
    this.flipped = this.game.registry.get('flipped') === true
    this.drawBoard()

    const initialFen = this.game.registry.get('fen') as string | undefined
    const lastAction = this.game.registry.get('lastAction') as LastAction | null | undefined
    if (initialFen) {
      this.populateFromFen(initialFen)
      this.lastFen = initialFen
      if (lastAction && lastAction.kind === 'move') {
        this.paintLastMoveHighlight(lastAction.from as Square, lastAction.to as Square)
      }
    }

    this.game.registry.events.on('changedata-fen', this.onFenChanged, this)
    this.events.once('shutdown', () => {
      this.game.registry.events.off('changedata-fen', this.onFenChanged, this)
    })
  }

  private onFenChanged = (_parent: unknown, newFen: string): void => {
    if (newFen === this.lastFen) return
    this.reconcile(newFen)
    this.lastFen = newFen
  }

  /** Diff the current piece map against the new FEN. If the diff is a
   *  single from→to (ordinary move or capture), animate it. Anything else
   *  (en-passant pair changes, promotion, multi-piece spell effect, castling)
   *  for M0 falls back to a silent teleport — Stage 3 will choreograph each. */
  private reconcile(newFen: string): void {
    const targetMap = this.parseFen(newFen)

    // Find squares that changed.
    const changed: Array<{ sq: Square; before: PieceState | null; after: PieceState['type'] | null; afterColor: PieceState['color'] | null }> = []
    for (const sq of allSquares()) {
      const before = this.piecesBySquare.get(sq) ?? null
      const after = targetMap.get(sq) ?? null
      if (!before && !after) continue
      if (before && after && before.type === after.type && before.color === after.color) continue
      changed.push({
        sq,
        before,
        after: after?.type ?? null,
        afterColor: after?.color ?? null,
      })
    }

    // Heuristic: exactly two changed squares, one emptied and one filled with
    // the same piece type/color → ordinary slide or capture.
    if (changed.length === 2) {
      const emptied = changed.find((c) => c.before && !c.after) ?? null
      const filled = changed.find((c) => !c.before && c.after) ?? null
      const replaced = changed.find((c) => c.before && c.after) ?? null
      // case A: slide into empty
      if (emptied && filled && filled.afterColor === emptied.before!.color && filled.after === emptied.before!.type) {
        const lastAction = this.game.registry.get('lastAction') as LastAction | null | undefined
        this.animateSlide(emptied.before!, filled.sq, lastAction)
        this.paintLastMoveHighlight(emptied.sq, filled.sq)
        return
      }
      // case B: capture — one square emptied by the mover, another's contents
      //         replaced by the mover.
      if (emptied && replaced && replaced.afterColor === emptied.before!.color && replaced.after === emptied.before!.type) {
        this.animateCapture(emptied.before!, replaced.sq, replaced.before!)
        this.paintLastMoveHighlight(emptied.sq, replaced.sq)
        return
      }
    }

    // Anything else → silent rebuild. Stage 3 owns the spell / castling /
    // promotion choreography.
    this.silentRebuild(targetMap)
  }

  private animateSlide(piece: PieceState, dest: Square, _lastAction?: LastAction | null | undefined): void {
    // Move it in the registry map FIRST so a subsequent diff (which can fire
    // again from a fresh onSnapshot) doesn't trip on the half-animated state.
    this.piecesBySquare.delete(piece.square)
    this.piecesBySquare.set(dest, piece)
    piece.square = dest
    const { x, y } = this.centerOf(dest)
    this.tweens.add({
      targets: piece.image,
      x, y,
      duration: MOVE_TWEEN_MS,
      ease: 'Cubic.Out',
    })
  }

  private animateCapture(mover: PieceState, dest: Square, captured: PieceState): void {
    // Update map immediately so a second onSnapshot in-flight sees the new
    // state, just like animateSlide.
    this.piecesBySquare.delete(mover.square)
    this.piecesBySquare.delete(dest)
    this.piecesBySquare.set(dest, mover)
    mover.square = dest

    const { x, y } = this.centerOf(dest)
    // Mover lunges, slightly overshoots the dest then snaps back.
    this.tweens.add({
      targets: mover.image,
      x, y,
      duration: MOVE_TWEEN_MS,
      ease: 'Cubic.Out',
    })

    // Captured piece fades + scales while a small particle puff fires.
    this.tweens.add({
      targets: captured.image,
      alpha: 0,
      scale: 0.4,
      duration: CAPTURE_FADE_MS,
      ease: 'Cubic.In',
      onComplete: () => captured.image.destroy(),
    })
    this.spawnDust(captured.image.x, captured.image.y, captured.color)
    // Tiny camera nudge so the capture has weight.
    this.cameras.main.shake(140, 0.004)
    void CAPTURE_LUNGE_OVERSHOOT // reserved for stage 3 polish
  }

  private spawnDust(x: number, y: number, color: 'w' | 'b'): void {
    const baseTint = color === 'w' ? 0xfff2c8 : 0x7a6090
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      const dot = this.add.circle(x, y, 4, baseTint, 0.85)
      const angle = (i / DUST_PARTICLE_COUNT) * Math.PI * 2
      const dist = Phaser.Math.Between(18, 36)
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 8,
        alpha: 0,
        scale: 0.3,
        duration: 480,
        ease: 'Cubic.Out',
        onComplete: () => dot.destroy(),
      })
    }
  }

  private silentRebuild(targetMap: Map<Square, { type: PieceState['type']; color: PieceState['color'] }>): void {
    // Drop everything and re-place. Cheap with 32 pieces max.
    for (const p of this.piecesBySquare.values()) p.image.destroy()
    this.piecesBySquare.clear()
    for (const [sq, info] of targetMap) {
      const { x, y } = this.centerOf(sq)
      const image = this.add.image(x, y, this.textureKey(info.type, info.color)).setOrigin(0.5, 0.5)
      this.fitToTile(image)
      this.piecesBySquare.set(sq, { ...info, image, square: sq })
    }
  }

  private populateFromFen(fen: string): void {
    const map = this.parseFen(fen)
    for (const [sq, info] of map) {
      const { x, y } = this.centerOf(sq)
      const image = this.add.image(x, y, this.textureKey(info.type, info.color)).setOrigin(0.5, 0.5)
      this.fitToTile(image)
      this.piecesBySquare.set(sq, { ...info, image, square: sq })
    }
  }

  private fitToTile(image: Phaser.GameObjects.Image): void {
    // Source PNGs are 256x256; we want them at ~68 / 72 = 94% of a tile to
    // leave a little breathing room around the base.
    const target = TILE * 0.94
    const scale = target / Math.max(image.width, image.height)
    image.setScale(scale)
  }

  /** Convert FEN's piece-placement field into a sparse map by square. */
  private parseFen(fen: string): Map<Square, { type: PieceState['type']; color: PieceState['color'] }> {
    const map = new Map<Square, { type: PieceState['type']; color: PieceState['color'] }>()
    const placement = fen.split(' ')[0]
    if (!placement) return map
    const rows = placement.split('/')
    for (let r = 0; r < 8; r++) {
      const rank = 8 - r
      let file = 0
      for (const ch of rows[r] ?? '') {
        if (/[1-8]/.test(ch)) {
          file += Number(ch)
          continue
        }
        const color: PieceState['color'] = ch >= 'A' && ch <= 'Z' ? 'w' : 'b'
        const type = ch.toLowerCase() as PieceState['type']
        const sq = (FILES[file] + String(rank)) as Square
        map.set(sq, { type, color })
        file += 1
      }
    }
    return map
  }

  private textureKey(type: PieceState['type'], color: PieceState['color']): string {
    const T = type.toUpperCase()
    return `stone-${color}${T}`
  }

  private centerOf(sq: Square): { x: number; y: number } {
    const file = FILES.indexOf(sq[0] as FileCh)
    const rank = Number(sq[1])
    const drawnFile = this.flipped ? 7 - file : file
    const drawnRank = this.flipped ? rank - 1 : 8 - rank
    return {
      x: BOARD_MARGIN + drawnFile * TILE + TILE / 2,
      y: BOARD_MARGIN + drawnRank * TILE + TILE / 2,
    }
  }

  private drawBoard(): void {
    const g = this.add.graphics()
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const isLight = (r + f) % 2 === 0
        g.fillStyle(isLight ? SQ_LIGHT : SQ_DARK, 1)
        g.fillRect(
          BOARD_MARGIN + f * TILE,
          BOARD_MARGIN + r * TILE,
          TILE,
          TILE,
        )
      }
    }
    g.lineStyle(2, 0xf4c266, 0.5).strokeRect(BOARD_MARGIN - 1, BOARD_MARGIN - 1, BOARD_SIZE + 2, BOARD_SIZE + 2)

    // File + rank labels around the edge.
    const labelStyle = { fontFamily: '"Cinzel", Georgia, serif', fontSize: '11px', color: '#bcb4d0' }
    for (let i = 0; i < 8; i++) {
      const filePos = BOARD_MARGIN + (this.flipped ? 7 - i : i) * TILE + TILE / 2
      this.add.text(filePos, BOARD_MARGIN / 2, FILES[i]!, labelStyle).setOrigin(0.5)
      this.add.text(filePos, BOARD_MARGIN + BOARD_SIZE + BOARD_MARGIN / 2, FILES[i]!, labelStyle).setOrigin(0.5)
      const rankPos = BOARD_MARGIN + (this.flipped ? i : 7 - i) * TILE + TILE / 2
      this.add.text(BOARD_MARGIN / 2, rankPos, String(i + 1), labelStyle).setOrigin(0.5)
      this.add.text(BOARD_MARGIN + BOARD_SIZE + BOARD_MARGIN / 2, rankPos, String(i + 1), labelStyle).setOrigin(0.5)
    }
  }

  private paintLastMoveHighlight(from: Square, to: Square): void {
    for (const r of this.lastMoveHighlights) r.destroy()
    this.lastMoveHighlights = []
    for (const sq of [from, to]) {
      const { x, y } = this.centerOf(sq)
      const rect = this.add.rectangle(x, y, TILE, TILE, LAST_MOVE_TINT, LAST_MOVE_ALPHA)
      // Insert behind pieces (which were added after this point).
      this.children.sendToBack(rect)
      this.lastMoveHighlights.push(rect)
    }
  }
}

function allSquares(): Square[] {
  const out: Square[] = []
  for (const f of FILES) for (let r = 1; r <= 8; r++) out.push(`${f}${r}` as Square)
  return out
}
