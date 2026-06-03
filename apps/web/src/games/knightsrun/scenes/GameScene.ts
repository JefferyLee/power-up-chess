// GameScene — the runner itself.
//
// Knight runs in place; the world scrolls past from right to left. Obstacles
// and coins are spawned off-screen right and move at the world's current
// speed. Single-tap (or SPACE / ↑) jumps. Touching a coin = +25 + ping;
// touching an obstacle = game over → GameOverScene.

import Phaser from 'phaser'
import { playSound } from '../../../sound/synth'
import {
  COIN_FLOAT_HEIGHTS,
  COIN_SPAWN_MAX_MS,
  COIN_SPAWN_MIN_MS,
  COIN_VALUE,
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
  private coins!: Phaser.GameObjects.Group

  private worldSpeed = START_SPEED
  private elapsedSec = 0
  private distance = 0
  private coinsCollected = 0

  private scoreText!: Phaser.GameObjects.Text
  private coinText!: Phaser.GameObjects.Text

  private nextObstacleAt = 0
  private nextCoinAt = 0
  private gameOver = false

  constructor() {
    super('Game')
  }

  create(): void {
    this.distance = 0
    this.coinsCollected = 0
    this.gameOver = false
    this.elapsedSec = 0
    this.worldSpeed = START_SPEED

    this.makeBackgroundTextures()
    this.makeCoinTexture()
    this.skyFar = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'sky-far').setOrigin(0, 0)
    this.skyNear = this.add.tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 'sky-near').setOrigin(0, 0)
    this.floor = this.add.tileSprite(0, GROUND_Y + 10, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y - 10, 'floor-checker').setOrigin(0, 0)

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

    this.obstacles = this.add.group()
    this.coins = this.add.group()

    // HUD — distance score on the right, coin count on the left.
    this.scoreText = this.add
      .text(WORLD_WIDTH - 20, 18, '0', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '24px',
        color: '#f4c266',
      })
      .setOrigin(1, 0)
    this.coinText = this.add
      .text(20, 18, '🪙 0', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '20px',
        color: '#ffd860',
      })
      .setOrigin(0, 0)

    this.input.keyboard?.on('keydown-SPACE', this.tryJump, this)
    this.input.keyboard?.on('keydown-UP', this.tryJump, this)
    this.input.on('pointerdown', this.tryJump, this)

    this.nextObstacleAt = this.time.now + 800
    this.nextCoinAt = this.time.now + 1400
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameOver) return
    const dt = deltaMs / 1000

    this.elapsedSec += dt
    this.worldSpeed = Math.min(
      MAX_SPEED,
      START_SPEED + this.elapsedSec * SPEED_RAMP_PER_SEC,
    )

    const dx = this.worldSpeed * dt
    this.distance += dx
    this.scoreText.setText(Math.floor(this.distance * SCORE_PER_PX * 10).toString())

    this.skyFar.tilePositionX += dx * 0.06
    this.skyNear.tilePositionX += dx * 0.18
    this.floor.tilePositionX += dx

    if (!this.onGround) {
      this.knightVy += GRAVITY_Y * dt
      this.knight.y += this.knightVy * dt
      if (this.knight.y >= GROUND_Y) {
        this.knight.y = GROUND_Y
        this.knightVy = 0
        this.onGround = true
      }
    }

    // Obstacles — move + cull.
    const obstacles = this.obstacles.getChildren() as Phaser.GameObjects.Image[]
    for (const ob of obstacles) {
      ob.x -= dx
      if (ob.x < -100) ob.destroy()
    }

    // Coins — move + cull + gentle bob so they catch the eye.
    const coins = this.coins.getChildren() as Phaser.GameObjects.Image[]
    for (const c of coins) {
      c.x -= dx
      if (c.x < -80) c.destroy()
    }

    // Obstacle spawn cadence: tightens as speed grows.
    if (this.time.now >= this.nextObstacleAt) {
      this.spawnObstacle()
      const speedRatio = Phaser.Math.Clamp((this.worldSpeed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1)
      const upper = Phaser.Math.Linear(SPAWN_MAX_MS, SPAWN_MIN_MS + 200, speedRatio)
      this.nextObstacleAt = this.time.now + Phaser.Math.Between(SPAWN_MIN_MS, upper)
    }

    // Coin spawn cadence: independent of obstacles.
    if (this.time.now >= this.nextCoinAt) {
      this.spawnCoin()
      this.nextCoinAt = this.time.now + Phaser.Math.Between(COIN_SPAWN_MIN_MS, COIN_SPAWN_MAX_MS)
    }

    // Collisions.
    const knightBox = this.knightHitbox()
    for (const c of coins) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(knightBox, c.getBounds())) {
        this.collectCoin(c)
      }
    }
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
    playSound('knight-jump')
  }

  private spawnObstacle(): void {
    const r = Math.random()
    let kind: ObstacleKind = 'pawn'
    if (r < 0.5) kind = 'pawn'
    else if (r < 0.85) kind = 'rook'
    else kind = 'queen'
    const spec = OBSTACLE_SPECS[kind]
    const ob = this.add.image(WORLD_WIDTH + 60, GROUND_Y + spec.yOffset, spec.textureKey).setOrigin(0.5, 1).setScale(spec.scale)
    this.obstacles.add(ob)
  }

  private spawnCoin(): void {
    const yOffset = COIN_FLOAT_HEIGHTS[Phaser.Math.Between(0, COIN_FLOAT_HEIGHTS.length - 1)] ?? -90
    const coin = this.add.image(WORLD_WIDTH + 40, GROUND_Y + yOffset - 16, 'coin').setOrigin(0.5, 0.5)
    // Gentle spinning sparkle — feels alive, signals "collectible".
    this.tweens.add({
      targets: coin,
      scaleX: { from: 1, to: 0.4 },
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
    this.coins.add(coin)
  }

  private collectCoin(coin: Phaser.GameObjects.Image): void {
    this.coinsCollected += 1
    this.coinText.setText(`🪙 ${this.coinsCollected}`)
    playSound('knight-coin')
    // Sparkle + fade burst at the coin's spot.
    this.tweens.add({
      targets: coin,
      alpha: 0,
      scale: 1.6,
      duration: 220,
      ease: 'Cubic.Out',
      onComplete: () => coin.destroy(),
    })
  }

  private knightHitbox(): Phaser.Geom.Rectangle {
    const w = 128 * 0.45
    const h = 128 * 0.85
    return new Phaser.Geom.Rectangle(this.knight.x - w / 2, this.knight.y - h, w, h)
  }

  private endRun(): void {
    if (this.gameOver) return
    this.gameOver = true
    playSound('knight-hit')
    this.cameras.main.shake(280, 0.012)
    this.cameras.main.flash(140, 220, 60, 40)
    this.tweens.add({
      targets: this.knight,
      angle: -25,
      duration: 280,
      ease: 'Sine.Out',
    })
    const distanceScore = Math.floor(this.distance * SCORE_PER_PX * 10)
    const coinBonus = this.coinsCollected * COIN_VALUE
    const totalScore = distanceScore + coinBonus
    this.time.delayedCall(600, () => {
      this.scene.start('GameOver', {
        distanceScore,
        coins: this.coinsCollected,
        coinBonus,
        score: totalScore,
      })
    })
  }

  private makeCoinTexture(): void {
    if (this.textures.exists('coin')) return
    const g = this.make.graphics({ x: 0, y: 0 })
    // Outer glow ring.
    g.fillStyle(0xffd860, 0.35).fillCircle(20, 20, 18)
    // Coin body + rim.
    g.fillStyle(0xfcc640, 1).fillCircle(20, 20, 14)
    g.fillStyle(0xfff2a8, 1).fillCircle(20, 20, 10)
    // Pawn-icon emboss centre — a tiny dark dot + stalk to suggest a pawn.
    g.fillStyle(0x8a5a08, 1).fillCircle(20, 18, 3)
    g.fillRect(18, 20, 4, 6)
    g.generateTexture('coin', 40, 40)
    g.destroy()
  }

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
      g.fillStyle(0x1a1428, 1)
      let x = 0
      while (x < WORLD_WIDTH) {
        const w = Phaser.Math.Between(60, 140)
        const h = Phaser.Math.Between(40, 90)
        g.fillRect(x, GROUND_Y - h, w, h)
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
