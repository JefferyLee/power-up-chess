// Knight's Run — Phaser-based dino-style runner.
//
// The route is the boundary between React and Phaser: React handles the
// page chrome (back button, title) and Phaser owns the canvas. The Phaser
// module is dynamically imported so the ~1MB engine bundle is only paid
// for when this route is visited — first-load of the castle isn't slowed
// down by it.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import { track } from '../../firebase/analytics'
import { WORLD_HEIGHT, WORLD_WIDTH } from './config'
import './KnightsRunRoute.css'

export function KnightsRunRoute() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const { identity } = useCastle()

  useEffect(() => {
    track('screen_view', { screen_name: 'knights_run' })
    // Phaser.Game instance — typed loosely because the module is imported
    // dynamically (we can't reference its types at the top level without
    // forcing the engine into the main bundle).
    let game: { destroy: (removeCanvas: boolean) => void; registry: { set: (k: string, v: unknown) => void } } | null = null
    let cancelled = false

    void (async () => {
      try {
        const [{ default: Phaser }, { BootScene }, { GameScene }, { GameOverScene }] = await Promise.all([
          import('phaser'),
          import('./scenes/BootScene'),
          import('./scenes/GameScene'),
          import('./scenes/GameOverScene'),
        ])
        if (cancelled || !containerRef.current) return

        const exitCallback = () => navigate('/')

        const instance = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          backgroundColor: '#0c0820',
          scene: [BootScene, GameScene, GameOverScene],
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          // Don't let arrow keys scroll the page — they're the jump key.
          input: {
            keyboard: {
              capture: [
                Phaser.Input.Keyboard.KeyCodes.SPACE,
                Phaser.Input.Keyboard.KeyCodes.UP,
              ],
            },
          },
          render: { antialias: true, pixelArt: false },
        })
        instance.registry.set('exitCallback', exitCallback)
        // Make the player's name available to GameOverScene so saved runs
        // get tagged with who played them (for a future cloud leaderboard).
        if (identity?.displayName) {
          instance.registry.set('displayName', identity.displayName)
        }
        game = instance as unknown as typeof game
        setStatus('ready')
      } catch (err) {
        console.error('[knights-run] failed to load Phaser:', err)
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      if (game) {
        try { game.destroy(true) } catch { /* idempotent destroy */ }
      }
    }
  }, [navigate])

  return (
    <div className="puc-knr">
      <header className="puc-knr__head">
        <button type="button" className="puc-knr__back" onClick={() => navigate('/')}>
          ← Back to castle
        </button>
        <h1 className="puc-knr__title">Knight's Run</h1>
        <span className="puc-knr__hint">SPACE / ↑ / tap = jump</span>
      </header>
      <div ref={containerRef} className="puc-knr__canvas">
        {status === 'loading' && <div className="puc-knr__loading">Loading the runner…</div>}
        {status === 'error' && <div className="puc-knr__loading">Couldn't load the game.</div>}
      </div>
    </div>
  )
}
