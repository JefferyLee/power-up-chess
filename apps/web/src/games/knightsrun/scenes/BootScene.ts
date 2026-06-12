// BootScene — load piece art + generate board textures, then start.
//
// Pieces are the cburnett SVGs (rasterised by Phaser at load); board
// squares / target discs / coins are generated procedurally so no
// extra assets ship.

import Phaser from 'phaser'
import knightWhiteUrl from '../../../cosmetics/assets/cburnett/wN.svg'
import pawnBlackUrl from '../../../cosmetics/assets/cburnett/bP.svg'
import rookBlackUrl from '../../../cosmetics/assets/cburnett/bR.svg'
import bishopBlackUrl from '../../../cosmetics/assets/cburnett/bB.svg'
import { SQ } from '../config'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    // Phaser 4's load.svg() does a buggy atob() on the response — load
    // SVGs as plain images instead; viewBox rasterises correctly.
    this.load.image('knight-w', knightWhiteUrl)
    this.load.image('pawn-b', pawnBlackUrl)
    this.load.image('rook-b', rookBlackUrl)
    this.load.image('bishop-b', bishopBlackUrl)
  }

  create(): void {
    this.makeSquareTexture('sq-light', 0xb99c6f, 0x8a7350)
    this.makeSquareTexture('sq-dark', 0x6e4f33, 0x523a26)
    this.makeTargetTexture()
    this.makeCoinTexture()
    this.scene.start('Game')
  }

  /** Rounded stone square with a few darker speckles. */
  private makeSquareTexture(key: string, fill: number, speckle: number): void {
    const g = this.add.graphics()
    g.fillStyle(fill, 1)
    g.fillRoundedRect(1, 1, SQ - 2, SQ - 2, 8)
    g.lineStyle(2, speckle, 0.55)
    g.strokeRoundedRect(1, 1, SQ - 2, SQ - 2, 8)
    g.fillStyle(speckle, 0.35)
    // Deterministic speckles — Boot runs once, any pattern works.
    const spots = [[18, 26, 4], [70, 14, 3], [44, 58, 5], [84, 74, 3], [22, 82, 4], [62, 90, 3]] as const
    for (const [x, y, r] of spots) g.fillCircle(x, y, r)
    g.generateTexture(key, SQ, SQ)
    g.destroy()
  }

  /** Pulsing landing-target disc: soft ring + translucent centre. */
  private makeTargetTexture(): void {
    const d = Math.floor(SQ * 0.78)
    const g = this.add.graphics()
    g.lineStyle(6, 0x7cc28b, 0.95)
    g.strokeCircle(d / 2, d / 2, d / 2 - 4)
    g.fillStyle(0x7cc28b, 0.3)
    g.fillCircle(d / 2, d / 2, d / 2 - 8)
    g.generateTexture('target', d, d)
    g.destroy()
  }

  private makeCoinTexture(): void {
    const d = 40
    const g = this.add.graphics()
    g.fillStyle(0xf1c34c, 1)
    g.fillCircle(d / 2, d / 2, d / 2 - 2)
    g.lineStyle(3, 0xb78938, 1)
    g.strokeCircle(d / 2, d / 2, d / 2 - 2)
    g.lineStyle(2, 0xfff0b8, 0.9)
    g.strokeCircle(d / 2, d / 2, d / 2 - 9)
    g.generateTexture('gold', d, d)
    g.destroy()
  }
}
