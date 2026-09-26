// Hud — top bar (gold / lives / wave / countdown / speed / pause / quit),
// boss bar + intro banner, paused overlay and the achievement toast.
// Everything here renders from the 10 Hz snapshot, never from sim.state.
import { BOSS_DEFS } from '../sim/defs'
import type { SimSnapshot } from './useSimSnapshot'

export interface HudToast {
  id: number
  text: string
}

interface Props {
  snap: SimSnapshot
  mapName: string
  toast: HudToast | null
  /** Parent decides — false while the quit dialog is up. */
  showPaused: boolean
  onStartNow: () => void
  onSpeed: (speed: 1 | 2) => void
  onTogglePause: () => void
  onQuit: () => void
  onSkipIntro: () => void
}

const START_NOW_GOLD_PER_SECOND = 2

export function Hud({ snap, mapName, toast, showPaused, onStartNow, onSpeed, onTogglePause, onQuit, onSkipIntro }: Props) {
  const building = snap.phase === 'build'
  const seconds = Math.ceil(snap.countdown)
  const waveLabel = building ? `Next: wave ${snap.wave + 1}` : `Wave ${snap.wave}`
  const totalLabel = snap.waveTotal > 0 ? `of ${snap.waveTotal}` : 'of ∞'
  const boss = snap.boss ? BOSS_DEFS[snap.boss.type] : null
  const intro = snap.bossIntro < 1 && snap.introBoss ? BOSS_DEFS[snap.introBoss] : null
  const running = snap.phase === 'build' || snap.phase === 'wave'

  return (
    <>
      <div className="puc-siege-top">
        <span className="puc-siege-top__map">{mapName}</span>
        <span className="puc-siege-stat puc-siege-stat--gold" title="Gold">
          <span aria-hidden="true">◉</span> {snap.gold}
        </span>
        <span className="puc-siege-stat puc-siege-stat--lives" title="Lives">
          <span aria-hidden="true">♥</span> {snap.lives}
          <small>/{snap.livesMax}</small>
        </span>
        <span className="puc-siege-stat puc-siege-stat--wave">
          {waveLabel} <small>{totalLabel}</small>
        </span>
        {building && running && (
          <button
            type="button"
            className="puc-siege-btn puc-siege-btn--start"
            onClick={onStartNow}
            title={`Start the wave now for +${seconds * START_NOW_GOLD_PER_SECOND} gold`}
          >
            Start now <small>{seconds} s · +{seconds * START_NOW_GOLD_PER_SECOND}</small>
          </button>
        )}
        <span className="puc-siege-top__spacer" />
        <div className="puc-siege-speed" role="radiogroup" aria-label="Game speed">
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={snap.speed === s}
              className={'puc-siege-seg' + (snap.speed === s ? ' puc-siege-seg--on' : '')}
              onClick={() => onSpeed(s)}
            >
              ×{s}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="puc-siege-btn puc-siege-btn--icon"
          onClick={onTogglePause}
          disabled={!running}
          aria-label={snap.paused ? 'Resume' : 'Pause'}
          title={snap.paused ? 'Resume' : 'Pause'}
        >
          {snap.paused ? '▶' : '❚❚'}
        </button>
        <button type="button" className="puc-siege-btn puc-siege-btn--icon" onClick={onQuit} aria-label="Leave the siege" title="Leave the siege">
          ✕
        </button>
      </div>

      {boss && snap.boss && (
        <div className="puc-siege-boss" role="status">
          <span className="puc-siege-boss__name">{boss.name}</span>
          <span className="puc-siege-boss__bar" aria-label={`${boss.name} health`}>
            <span className="puc-siege-boss__fill" style={{ width: `${Math.max(0, Math.min(100, (snap.boss.hp / snap.boss.maxHp) * 100))}%` }} />
          </span>
          {snap.boss.shieldLayers > 0 && (
            <span className="puc-siege-boss__shield" title="Shield layers">
              {'◈'.repeat(snap.boss.shieldLayers)}
            </span>
          )}
        </div>
      )}

      {intro && (
        <div className="puc-siege-intro" role="status">
          <div className="puc-siege-intro__banner">
            <span className="puc-siege-intro__title">{intro.title}</span>
            <strong className="puc-siege-intro__name">{intro.name}</strong>
            <p className="puc-siege-intro__line">{intro.intro}</p>
          </div>
          <button type="button" className="puc-siege-btn" onClick={onSkipIntro}>
            Skip
          </button>
        </div>
      )}

      {showPaused && (
        <div className="puc-siege-overlay" role="dialog" aria-label="Paused">
          <div className="puc-siege-card">
            <h2 className="puc-siege-card__title">Paused</h2>
            <p className="puc-siege-card__text">The black army waits. Take your time.</p>
            <div className="puc-siege-card__actions">
              <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={onTogglePause}>
                Resume
              </button>
              <button type="button" className="puc-siege-btn" onClick={onQuit}>
                Leave the siege
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.id} className="puc-siege-toast" role="status">
          {toast.text}
        </div>
      )}
    </>
  )
}
