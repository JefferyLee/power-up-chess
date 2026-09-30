// GameOverScene — overlay shown after a run ends.
//
// Shows the score breakdown (leaps · captures · forks), the player's
// personal best from local IDB, and Run-again / Back buttons. If the run
// just broke the best, the row gets a "NEW BEST!" tag + a fanfare sound.

import Phaser from 'phaser'
import { playSound } from '../../../sound/synth'
import { prefersReducedMotion } from '../../../a11y/usePrefersReducedMotion'
import { loadBestRun, saveKnightsRun } from '../history'
import { WORLD_HEIGHT, WORLD_WIDTH } from '../config'

interface InitData {
  ranks: number
  captures: number
  forks: number
  score: number
}

export class GameOverScene extends Phaser.Scene {
  private ranks = 0
  private captures = 0
  private forks = 0
  private score = 0
  private bestRowText: Phaser.GameObjects.Text | null = null
  private newBestTag: Phaser.GameObjects.Text | null = null

  constructor() {
    super('GameOver')
  }

  init(data: InitData): void {
    this.ranks = data.ranks
    this.captures = data.captures
    this.forks = data.forks
    this.score = data.score
  }

  create(): void {
    const overlay = this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0x0c0820, 0.78).setOrigin(0, 0)
    overlay.setInteractive() // swallow clicks so they don't trigger jump

    this.add
      .text(WORLD_WIDTH / 2, 56, 'The Knight Fell', {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '34px',
        color: '#f4c266',
      })
      .setOrigin(0.5)

    this.add
      .text(WORLD_WIDTH / 2, 110, `${this.score}`, {
        fontFamily: '"Cinzel", Georgia, serif',
        fontSize: '56px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    // Breakdown row.
    const breakdown = `Leaps ${this.ranks}   ·   Captures ${this.captures}   ·   Forks ${this.forks}`
    this.add
      .text(WORLD_WIDTH / 2, 156, breakdown, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#bcb4d0',
      })
      .setOrigin(0.5)

    // Best score row — populated async from IDB.
    this.bestRowText = this.add
      .text(WORLD_WIDTH / 2, 192, 'Best: …', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#bcb4d0',
      })
      .setOrigin(0.5)

    void this.recordAndShowBest()

    const restart = this.makeButton(WORLD_WIDTH / 2 - 95, 248, 'Run again', () => {
      this.scene.start('Game')
    })
    const back = this.makeButton(WORLD_WIDTH / 2 + 95, 248, 'Back', () => {
      const exit = this.game.registry.get('exitCallback') as (() => void) | undefined
      exit?.()
    })
    void restart; void back
  }

  private async recordAndShowBest(): Promise<void> {
    // Read the previous best BEFORE writing, so we can compare and tag.
    let prevBest = 0
    try {
      const prev = await loadBestRun()
      prevBest = prev?.score ?? 0
    } catch {
      // IDB unavailable (private mode etc.) — skip persistence, just show "—".
    }
    const isNewBest = this.score > prevBest

    try {
      const displayName = (this.game.registry.get('displayName') as string | undefined) ?? ''
      // IDB schema predates the rebuild — map leaps→distance and
      // captures→coins rather than bump the store version.
      await saveKnightsRun({
        runId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        displayName,
        score: this.score,
        distance: this.ranks,
        coins: this.captures,
        finishedAt: Date.now(),
      })
    } catch {
      // Same — non-fatal.
    }

    const newBest = Math.max(prevBest, this.score)
    this.bestRowText?.setText(`Best: ${newBest}`)
    if (isNewBest && this.score > 0) {
      this.newBestTag = this.add
        .text(WORLD_WIDTH / 2, 216, '✨ NEW BEST!', {
          fontFamily: '"Cinzel", Georgia, serif',
          fontSize: '16px',
          color: '#ffd860',
        })
        .setOrigin(0.5)
      if (!prefersReducedMotion()) {
        this.tweens.add({
          targets: this.newBestTag,
          scale: { from: 0.6, to: 1.0 },
          duration: 300,
          ease: 'Back.Out',
        })
      }
      playSound('knight-newbest')
    }
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const w = 170
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
