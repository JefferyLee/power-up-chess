// GameOverScene — overlay shown after a run ends. Score + Restart + Back.
//
// "Back" is wired up by the React route: it listens for the 'exit' event the
// scene emits via the global registry. The scene itself just calls into the
// Game's registered exitCallback.

import Phaser from 'phaser'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config'

interface InitData { score: number }

export class GameOverScene extends Phaser.Scene {
  private score = 0

  constructor() {
    super('GameOver')
  }

  init(data: InitData): void {
    this.score = data.score
  }

  create(): void {
    const overlay = this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x0c0820, 0.78).setOrigin(0, 0)
    overlay.setInteractive() // swallow clicks so they don't trigger jump

    this.add
      .text(WORLD_WIDTH / 2, 110, 'The Knight Fell', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '38px',
        color: '#f4c266',
      })
      .setOrigin(0.5)

    this.add
      .text(WORLD_WIDTH / 2, 165, `${this.score}`, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.add
      .text(WORLD_WIDTH / 2, 215, 'distance run', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#9892a8',
      })
      .setOrigin(0.5)

    const restart = this.makeButton(WORLD_WIDTH / 2 - 90, 275, 'Run again', () => {
      this.scene.start('Game')
    })
    const back = this.makeButton(WORLD_WIDTH / 2 + 90, 275, 'Back', () => {
      const exit = this.game.registry.get('exitCallback') as (() => void) | undefined
      exit?.()
    })
    void restart; void back
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const w = 160
    const h = 40
    const bg = this.add.rectangle(0, 0, w, h, 0xf4c266).setStrokeStyle(1, 0xb78938)
    const txt = this.add
      .text(0, 0, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#1a1530',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    const c = this.add.container(x, y, [bg, txt])
    c.setSize(w, h)
    c.setInteractive({ useHandCursor: true })
    c.on('pointerdown', onClick)
    c.on('pointerover', () => bg.setFillStyle(0xf8d076))
    c.on('pointerout', () => bg.setFillStyle(0xf4c266))
    return c
  }
}
