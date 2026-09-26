// Results — won / lost overlay. Stars reveal one by one (CSS delays),
// then score, best and the way onward. Submits to the global board when
// the outcome carries a request (only non-bypass guests get one).
import { useEffect, useState } from 'react'
import { callSubmitSiegeScore, type SubmitSiegeScoreRequest } from '../../../firebase/callables'
import { ACHIEVEMENTS, type AchievementId } from './progress'

export type RunMode = 'campaign' | 'endless' | 'daily'

export interface Outcome {
  won: boolean
  stars: 0 | 1 | 2 | 3
  score: number
  wave: number
  /** Best before this run, for "new best" / "best" lines. */
  prevBest: number
  newAchievements: AchievementId[]
  /** Leaderboard request, or null when this guest can't be on the board. */
  submit: SubmitSiegeScoreRequest | null
}

interface Props {
  outcome: Outcome
  mode: RunMode
  mapName: string
  /** True when the guest is signed in with a name (not bypass). */
  signedIn: boolean
  hasNext: boolean
  onNext: () => void
  onReplay: () => void
  onEndless: () => void
  onMenu: () => void
}

type SubmitState = 'idle' | 'sending' | 'done' | 'failed'

function headline(outcome: Outcome, mode: RunMode): string {
  if (mode !== 'campaign') return `The walls held for ${outcome.wave} wave${outcome.wave === 1 ? '' : 's'}.`
  if (!outcome.won) return `The gate fell on wave ${outcome.wave}.`
  return 'The castle stands.'
}

function detail(outcome: Outcome, mode: RunMode): string {
  if (mode !== 'campaign') {
    return outcome.wave >= 20
      ? 'Twenty waves and more. The black army will remember this table.'
      : 'Every wave you held shows you where the pieces reach — and where they don’t.'
  }
  if (!outcome.won) {
    return outcome.wave > 1
      ? `You held ${outcome.wave - 1} wave${outcome.wave === 2 ? '' : 's'} before that. Look at where they slipped through — that is where the next piece goes.`
      : 'The first wave is the hardest to read. Watch the road, then place a pawn where the diagonals cross it.'
  }
  if (outcome.stars === 3) return 'Not a single life lost. That was a clean defense.'
  if (outcome.stars === 2) return 'A few slipped past, but the castle stands. Three stars means none get through.'
  return 'Close — but the castle stands. Watch which road they took; a rook on a long line would have met them.'
}

export function Results({ outcome, mode, mapName, signedIn, hasNext, onNext, onReplay, onEndless, onMenu }: Props) {
  const [submit, setSubmit] = useState<SubmitState>(outcome.submit ? 'sending' : 'idle')

  useEffect(() => {
    const req = outcome.submit
    if (!req) return
    let cancelled = false
    callSubmitSiegeScore(req)
      .then(() => {
        if (!cancelled) setSubmit('done')
      })
      .catch(() => {
        if (!cancelled) setSubmit('failed')
      })
    return () => {
      cancelled = true
    }
  }, [outcome.submit])

  const newBest = outcome.score > outcome.prevBest
  const best = Math.max(outcome.score, outcome.prevBest)

  return (
    <div className="puc-siege-overlay" role="dialog" aria-label="Results">
      <div className={'puc-siege-card puc-siege-results' + (outcome.won ? ' puc-siege-results--won' : '')}>
        <span className="puc-siege-results__map">{mapName}</span>
        <h2 className="puc-siege-card__title">{headline(outcome, mode)}</h2>

        {mode === 'campaign' && outcome.won && (
          <div className="puc-siege-stars puc-siege-stars--reveal" aria-label={`${outcome.stars} of 3 stars`}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={'puc-siege-star' + (i <= outcome.stars ? ' puc-siege-star--on' : '')}
                style={{ animationDelay: `${0.25 * i}s` }}
                aria-hidden="true"
              >
                {i <= outcome.stars ? '★' : '☆'}
              </span>
            ))}
          </div>
        )}

        <p className="puc-siege-card__text">{detail(outcome, mode)}</p>

        <dl className="puc-siege-results__score">
          <div>
            <dt>Score</dt>
            <dd>{outcome.score}</dd>
          </div>
          <div>
            <dt>{newBest ? 'New best' : 'Best'}</dt>
            <dd>{best}</dd>
          </div>
          {mode !== 'campaign' && (
            <div>
              <dt>Wave</dt>
              <dd>{outcome.wave}</dd>
            </div>
          )}
        </dl>

        {outcome.newAchievements.length > 0 && (
          <ul className="puc-siege-results__achievements">
            {outcome.newAchievements.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id)
              return (
                <li key={id}>
                  <strong>{a?.name ?? id}</strong> — {a?.description ?? ''}
                </li>
              )
            })}
          </ul>
        )}

        <p className="puc-siege-results__board">
          {submit === 'sending' && 'Sending your score to the board…'}
          {submit === 'done' && 'Your score is on the board.'}
          {submit === 'failed' && 'The board did not answer — your score is saved here, try again later.'}
          {submit === 'idle' && !signedIn && 'Enter the castle with your name and magic word to put this on the Defenders\u2019 Board.'}
        </p>

        <div className="puc-siege-card__actions">
          {hasNext && outcome.won && (
            <button type="button" className="puc-siege-btn puc-siege-btn--primary" onClick={onNext}>
              Next map
            </button>
          )}
          <button type="button" className={'puc-siege-btn' + (!hasNext || !outcome.won ? ' puc-siege-btn--primary' : '')} onClick={onReplay}>
            {mode === 'campaign' ? 'Replay' : 'Again'}
          </button>
          {mode === 'campaign' && outcome.won && (
            <button type="button" className="puc-siege-btn" onClick={onEndless}>
              Endless
            </button>
          )}
          <button type="button" className="puc-siege-btn" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
