// GameScene — the runner itself.
//
// Knight runs in place; the world scrolls past from right to left. Obstacles
// are spawned off-screen right and move at the world's current speed. Single-
// tap (or SPACE / ↑) jumps. Collision = game over → GameOverScene.

import Phaser from 'phaser'
import {
  GRAVITY_Y,
  GROUND_Y,
  JUMP_VELOCITY,
  MAX_SPEED,
  SCORE_PER_PX,
  SPAWN_MAX_MS,
  SPAWN_MIN_MS,
  SPEED_RAMP_PER_SEC,
  START_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../config'

type ObstacleKind = 'pawn' | 'rook' | 'queen'

interface ObstacleSpec {
  textureKey: string
  yOffset: number // negative from ground = floats above
  scale: number
}

const OBSTACLE_SPECS: Record<ObstacleKind, ObstacleSpec> = {
  pawn: { textureKey: 'pawn-b', yOffset: 0, scale: 1 },
  rook: { textureKey: 'rook-b', yOffset: 0, scale: 1 },
  queen: { textureKey: 'queen-b', yOffset: -10, scale: 1 },
}

export class GameScene extends Phaser.Scene {
  private knight!: Phaser.GameObjects.Image
  private knightVy = 0
  private onGround = true

  private floor!: Phaser.GameObjects.TileSprite
  private skyFar!: Phaser.GameObjects.TileSprite
  private skyNear!: Phaser.GameObjects.TileSprite

  private obstacles!: Phaser.GameObjects.Group

  private worldSpeed = START_SPEED
  private elapsedSec = 0
  private distance = 0

  private scoreText!: Phaser.GameObjects.Text

  private nextSpawnAt = 0
  private gameOver = false

  constructor() {
    super('Game')
  }

  create(): void {
    // ── Background: layered parallax. We don't have art so we use generated
    //    textures (a checker for the floor, a vertical gradient for the sky).
    this.makeBackgroundTextures()
    this.skyFar = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'sky-far').setOrigin(0, 0)
    this.skyNear = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'sky-near').setOrigin(0, 0)
    this.floor = this.add.tileSprite(0, GROUND_Y + 10, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y - 10, 'floor-checker').setOrigin(0, 0)

    // ── Knight (player). Chibi sprite is 256px; scale down so it sits
    //    nicely on the ground line. Slight bounce tween to look alive while
    //    idle (squash-stretch from base scale, not absolute, so we don't
    //    fight the size scale).
    const KNIGHT_SCALE = 0.5
    this.knight = this.add.image(150, GROUND_Y, 'knight-chibi').setOrigin(0.5, 1).setScale(KNIGHT_SCALE)
    this.tweens.add({
      targets: this.knight,
      scaleY: KNIGHT_SCALE * 0.97,
      scaleX: KNIGHT_SCALE * 1.03,
      duration: 240,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })

    // ── Obstacles group — plain Phaser group, no physics. We move them
    //    manually so the world scroll speed is the single source of truth.
    this.obstacles = this.add.group()

    // ── HUD.
    this.scoreText = this.add
      .text(WORLD_WIDTH - 20, 18, '0', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '24px',
        color: '#f4c266',
      })
      .setOrigin(1, 0)

    // ── Input. Anywhere on the canvas + ↑ + SPACE all jump.
    this.input.keyboard?.on('keydown-SPACE', this.tryJump, this)
    this.input.keyboard?.on('keydown-UP', this.tryJump, this)
    this.input.on('pointerdown', this.tryJump, this)

    this.nextSpawnAt = this.time.now + 800
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameOver) return
    const dt = deltaMs / 1000

    // Speed ramp.
    this.elapsedSec += dt
    this.worldSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + this.elapsedSec * SPEED_RAMP_PER_SEC,
    )

    // Score = distance travelled.
    const dx = this.worldSpeed * dt
    this.distance += dx
    this.scoreText.setText(Math.floor(this.distance * SCORE_PER_PX * 10).toString())

    // Scroll background layers — far slowest, near medium, floor fastest.
    this.skyFar.tilePositionX += dx * 0.06
    this.skyNear.tilePositionX += dx * 0.18
    this.floor.tilePositionX += dx

    // Knight physics — simple Y integrator, no Phaser physics dependency.
    if (!this.onGround) {
      this.knightVy += GRAVITY_Y * dt
      this.knight.y += this.knightVy * dt
      if (this.knight.y >= GROUND_Y) {
        this.knight.y = GROUND_Y
        this.knightVy = 0
        this.onGround = true
      }
    }

    // Move existing obstacles left; cull off-screen.
    const obstacles = this.obstacles.getChildren() as Phaser.GameObjects.Image[]
    for (const ob of obstacles) {
      ob.x -= dx
      if (ob.x < -100) {
        ob.destroy()
      }
    }

    // Spawn new obstacles.
    if (this.time.now >= this.nextSpawnAt) {
      this.spawnObstacle()
      // The faster we go, the more often we spawn — but never under
      // SPAWN_MIN_MS so a fresh runner still gets reaction time.
      const speedRatio = Phaser.Math.Clamp((this.worldSpeed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1)
      const upper = Phaser.Math.Linear(SPAWN_MAX_MS, SPAWN_MIN_MS + 200, speedRatio)
      this.nextSpawnAt = this.time.now + Phaser.Math.Between(SPAWN_MIN_MS, upper)
    }

    // Collision check — simple AABB. Knight bounding box is intentionally
    // a bit smaller than its sprite so the game feels generous.
    const knightBox = this.knightHitbox()
    for (const ob of obstacles) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(knightBox, ob.getBounds())) {
        this.endRun()
        break
      }
    }
  }

  private tryJump(): void {
    if (this.gameOver) return
    if (!this.onGround) return
    this.knightVy = JUMP_VELOCITY
    this.onGround = false
  }

  private spawnObstacle(): void {
    // Pick a kind. As speed grows, queens (tall, mean) appear more often.
    const r = Math.random()
    let kind: ObstacleKind = 'pawn'
    if (r < 0.5) kind = 'pawn'
    else if (r < 0.85) kind = 'rook'
    else kind = 'queen'
    const spec = OBSTACLE_SPECS[kind]
    const ob = this.add.image(WORLD_WIDTH + 60, GROUND_Y + spec.yOffset, spec.textureKey).setOrigin(0.5, 1).setScale(spec.scale)
    this.obstacles.add(ob)
  }

  private knightHitbox(): Phaser.Geom.Rectangle {
    // Chibi sprite is 256 × 256 source, rendered at 0.5 scale → 128 visible.
    // Origin (0.5, 1). Inset generously so the kid's hitbox feels fair —
    // the cape and shield extents shouldn't count as the body.
    const w = 128 * 0.45
    const h = 128 * 0.85
    return new Phaser.Geom.Rectangle(this.knight.x - w / 2, this.knight.y - h, w, h)
  }

  private endRun(): void {
    if (this.gameOver) return
    this.gameOver = true
    this.cameras.main.shake(280, 0.012)
    this.cameras.main.flash(140, 220, 60, 40)
    this.tweens.add({
      targets: this.knight,
      angle: -25,
      duration: 280,
      ease: 'Sine.Out',
    })
    const finalScore = Math.floor(this.distance * SCORE_PER_PX * 10)
    this.time.delayedCall(600, () => {
      this.scene.start('GameOver', { score: finalScore })
    })
  }

  /** Generate the procedural textures used by background tile-sprites. We
   *  redraw if cached entries already exist (HMR / re-mount safety). */
  private makeBackgroundTextures(): void {
    if (!this.textures.exists('floor-checker')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      const cell = 36
      g.fillStyle(0x2a1f47).fillRect(0, 0, cell * 2, cell * 2)
      g.fillStyle(0x3a2e5e).fillRect(0, 0, cell, cell)
      g.fillStyle(0x3a2e5e).fillRect(cell, cell, cell, cell)
      g.generateTexture('floor-checker', cell * 2, cell * 2)
      g.destroy()
    }
    if (!this.textures.exists('sky-far')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      g.fillGradientStyle(0x1a1530, 0x1a1530, 0x2a1f47, 0x2a1f47, 1)
      g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      // Sparse stars.
      g.fillStyle(0xffffff, 0.55)
      const rng = new Phaser.Math.RandomDataGenerator(['knight-stars-far'])
      for (let i = 0; i < 60; i++) {
        const x = rng.between(0, WORLD_WIDTH)
        const y = rng.between(0, GROUND_Y - 80)
        const r = rng.between(1, 2)
        g.fillCircle(x, y, r)
      }
      g.generateTexture('sky-far', WORLD_WIDTH, WORLD_HEIGHT)
      g.destroy()
    }
    if (!this.textures.exists('sky-near')) {
      const g = this.make.graphics({ x: 0, y: 0 })
      // Distant castle silhouette — a series of crenellated rectangles.
      g.fillStyle(0x1a1428, 1)
      let x = 0
      while (x < WORLD_WIDTH) {
        const w = Phaser.Math.Between(60, 140)
        const h = Phaser.Math.Between(40, 90)
        g.fillRect(x, GROUND_Y - h, w, h)
        // Crenellations on top.
        for (let cx = 0; cx < w; cx += 16) {
          if (Math.floor(cx / 16) % 2 === 0) {
            g.fillRect(x + cx, GROUND_Y - h - 8, 10, 8)
          }
        }
        x += w + Phaser.Math.Between(0, 30)
      }
      g.generateTexture('sky-near', WORLD_WIDTH, WORLD_HEIGHT)
      g.destroy()
    }
  }
}
