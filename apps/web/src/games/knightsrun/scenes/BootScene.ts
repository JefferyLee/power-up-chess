// BootScene — load assets, then jump straight into GameScene.
//
// We load the piece SVGs we need (knight = player, pawn/rook/queen = obstacles)
// at small fixed sizes. Phaser rasterises SVGs at load time, so the size we
// pass becomes the texture resolution; larger = sharper but heavier.

import Phaser from 'phaser'
import knightWhiteUrl from '../../../cosmetics/assets/cburnett/wN.svg'
import pawnBlackUrl from '../../../cosmetics/assets/cburnett/bP.svg'
import rookBlackUrl from '../../../cosmetics/assets/cburnett/bR.svg'
import queenBlackUrl from '../../../cosmetics/assets/cburnett/bQ.svg'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  preload(): void {
    // Phaser 4's load.svg() does a buggy atob() on the response and throws on
    // any non-base64 input — bypass it by loading the SVGs as plain images.
    // SVGs with viewBox rasterise correctly through the <img> path; the only
    // thing we lose is the width/height resize parameter (we scale at use).
    this.load.image('knight-w', knightWhiteUrl)
    this.load.image('pawn-b', pawnBlackUrl)
    this.load.image('rook-b', rookBlackUrl)
    this.load.image('queen-b', queenBlackUrl)
  }

  create(): void {
    this.scene.start('Game')
  }
}
