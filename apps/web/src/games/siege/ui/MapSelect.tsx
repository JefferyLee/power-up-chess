// MapSelect — the campaign grid, today's challenge, the board button
// and the achievements strip.
import { useState, type CSSProperties } from 'react'
import { dailyChallenge } from '../content'
import { MODIFIER_INFO } from '../sim/defs'
import type { MapDef, Theme } from '../sim/types'
import { ACHIEVEMENTS, isMapUnlocked, type SiegeProgress } from './progress'

export type DailyInfo = ReturnType<typeof dailyChallenge>

interface Props {
  campaign: ReadonlyArray<MapDef>
  progress: SiegeProgress
  onPlay: (map: MapDef) => void
  onEndless: (map: MapDef) => void
  onDaily: (daily: DailyInfo) => void
  onLeaderboard: () => void
}

const THEME_COLOR: Record<Theme, string> = {
  courtyard: '#9ccf6a',
  forest: '#3f9a5c',
  frost: '#9fd8ff',
  lava: '#ff7a3d',
  throne: '#b48cff',
}

/** Read once per mount — the menu remounts after every run, so the
 *  daily card follows the calendar without a clock in render. */
function todaysChallenge(): DailyInfo | null {
  try {
    return dailyChallenge(new Date())
  } catch {
    return null
  }
}

export function MapSelect({ campaign, progress, onPlay, onEndless, onDaily, onLeaderboard }: Props) {
  const [daily] = useState(todaysChallenge)
  const dailyBest = daily ? progress.dailyBest[daily.dateKey] : undefined

  return (
    <div className="puc-siege-menu">
      <header className="puc-siege-menu__head">
        <h1 className="puc-siege-menu__title">The Siege</h1>
        <p className="puc-siege-menu__lede">
          The black army is marching on the castle. Your white pieces hold the walls — and each one attacks exactly the way it moves.
        </p>
        <button type="button" className="puc-siege-btn" onClick={onLeaderboard}>
          Defenders’ Board
        </button>
      </header>

      <section className="puc-siege-menu__section" aria-label="Today's challenge">
        {daily ? (
          <article className="puc-siege-mapcard puc-siege-mapcard--daily" style={{ '--puc-map-color': THEME_COLOR[daily.map.theme] } as CSSProperties}>
            <span className="puc-siege-mapcard__chip" aria-hidden="true" />
            <div className="puc-siege-mapcard__body">
              <span className="puc-siege-mapcard__kicker">Today’s challenge · {daily.dateKey}</span>
              <h2 className="puc-siege-mapcard__name">{daily.map.name}</h2>
              <p className="puc-siege-mapcard__sub">
                Endless rules
                {daily.modifiers.length > 0 ? ' · ' + daily.modifiers.map((m) => MODIFIER_INFO[m].name).join(' · ') : ''}
              </p>
              <p className="puc-siege-mapcard__best">
                {dailyBest ? `Your best today: ${dailyBest.score} (wave ${dailyBest.wave})` : 'No run yet today.'}
              </p>
            </div>
            <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={() => onDaily(daily)}>
              Play today’s
            </button>
          </article>
        ) : (
          <p className="puc-siege-menu__note">Today’s challenge is still being drawn up.</p>
        )}
      </section>

      <section className="puc-siege-menu__section" aria-label="Campaign">
        <div className="puc-siege-grid">
          {campaign.map((map, i) => {
            const unlocked = isMapUnlocked(progress, campaign, i)
            const stars = progress.stars[map.id] ?? 0
            const best = progress.best[map.id]
            const prev = campaign[i - 1]
            return (
              <article
                key={map.id}
                className={'puc-siege-mapcard' + (unlocked ? '' : ' puc-siege-mapcard--locked')}
                style={{ '--puc-map-color': THEME_COLOR[map.theme] } as CSSProperties}
                aria-label={`${map.order}. ${map.name}${unlocked ? '' : ' (locked)'}`}
              >
                <span className="puc-siege-mapcard__chip" aria-hidden="true" />
                <div className="puc-siege-mapcard__body">
                  <span className="puc-siege-mapcard__kicker">
                    {map.order}. {map.subtitle}
                  </span>
                  <h2 className="puc-siege-mapcard__name">{map.name}</h2>
                  <p className="puc-siege-mapcard__intro">{map.intro}</p>
                  <span className="puc-siege-stars" aria-label={`${stars} of 3 stars`}>
                    {[1, 2, 3].map((n) => (
                      <span key={n} className={'puc-siege-star' + (n <= stars ? ' puc-siege-star--on' : '')} aria-hidden="true">
                        {n <= stars ? '★' : '☆'}
                      </span>
                    ))}
                  </span>
                  {best !== undefined && <span className="puc-siege-mapcard__best">Best {best}</span>}
                  {map.modifiers.length > 0 && (
                    <span className="puc-siege-mapcard__mods">
                      {map.modifiers.map((m) => (
                        <span key={m} className="puc-siege-tag" title={MODIFIER_INFO[m].description}>
                          {MODIFIER_INFO[m].name}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
                {unlocked ? (
                  <div className="puc-siege-mapcard__actions">
                    <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={() => onPlay(map)}>
                      {stars > 0 ? 'Play again' : 'Play'}
                    </button>
                    {stars > 0 && (
                      <button type="button" className="puc-siege-btn" onClick={() => onEndless(map)} title="Waves without end — how long can the walls hold?">
                        Endless
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="puc-siege-mapcard__locked">
                    <span aria-hidden="true">🔒</span> Win {prev ? prev.name : 'the map before'} first — one star opens this gate.
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="puc-siege-menu__section" aria-label="Achievements">
        <h2 className="puc-siege-menu__subtitle">
          Achievements · {progress.achievements.length}/{ACHIEVEMENTS.length}
        </h2>
        <ul className="puc-siege-achievements">
          {ACHIEVEMENTS.map((a) => {
            const earned = progress.achievements.includes(a.id)
            return (
              <li key={a.id} className={'puc-siege-achievement' + (earned ? ' puc-siege-achievement--earned' : '')} title={a.description}>
                <span aria-hidden="true">{earned ? '✦' : '·'}</span> {a.name}
              </li>
            )
          })}
        </ul>
      </section>

      <p className="puc-siege-rotate">Turn your tablet sideways — the castle table is wide.</p>
    </div>
  )
}
