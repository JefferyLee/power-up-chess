import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { PuzzleScore } from './scoring'
import { starLabel } from './scoring'
import './RewardPopup.css'

interface Props {
  score: PuzzleScore
  /** Player's total points across all puzzles BEFORE adding this attempt. */
  totalBefore: number
  /** Points contributed by this attempt to the total (best-of, so often == score.points but can be 0). */
  added: number
  onNext: () => void
  onBack: () => void
}

export function RewardPopup({ score, totalBefore, added, onNext, onBack }: Props) {
  // Reveal stars one at a time for a little drama.
  const [revealed, setRevealed] = useState(0)
  useEffect(() => {
    const ids: number[] = []
    for (let i = 1; i <= score.stars; i++) {
      ids.push(window.setTimeout(() => setRevealed(i), 200 + i * 220))
    }
    return () => ids.forEach(window.clearTimeout)
  }, [score.stars])

  return (
    <div className="puc-reward" role="dialog" aria-modal="true" aria-labelledby="puc-reward-title">
      <div className="puc-reward__backdrop" />
      <div className="puc-reward__card">
        <h2 id="puc-reward-title" className="puc-reward__title">Solved!</h2>

        <div className="puc-reward__stars" aria-label={`${score.stars} of 3 stars`}>
          {[1, 2, 3].map((i) => (
            <Star key={i} filled={i <= revealed} dim={i > score.stars} />
          ))}
        </div>

        <p className="puc-reward__say">{starLabel(score.stars)}</p>

        <div className="puc-reward__breakdown">
          <BreakdownRow label="Solving the puzzle" pts={score.breakdown.base} />
          <BreakdownRow label="Speed bonus" pts={score.breakdown.speed} />
          <BreakdownRow label="First-try bonus" pts={score.breakdown.firstTry} />
          <BreakdownRow label="No-hint bonus" pts={score.breakdown.noHints} />
          <BreakdownRow label="This puzzle" pts={score.points} total />
        </div>

        <div className="puc-reward__total">
          <span className="puc-reward__total-label">Total points</span>
          <span className="puc-reward__total-value">
            {totalBefore + added}
            {added > 0 && <span className="puc-reward__total-delta"> (+{added})</span>}
            {added === 0 && totalBefore > 0 && (
              <span className="puc-reward__total-delta"> (best already saved)</span>
            )}
          </span>
        </div>

        <div className="puc-reward__actions">
          <button type="button" className="puc-reward__btn puc-reward__btn--ghost" onClick={onBack}>
            Back to garden
          </button>
          <button type="button" className="puc-reward__btn puc-reward__btn--primary" onClick={onNext}>
            Next puzzle
          </button>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, pts, total }: { label: string; pts: number; total?: boolean }) {
  if (!total && pts === 0) return null
  return (
    <div className={clsx('puc-reward__row', total && 'puc-reward__row--total')}>
      <span>{label}</span>
      <span>+{pts}</span>
    </div>
  )
}

function Star({ filled, dim }: { filled: boolean; dim: boolean }) {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      className={clsx('puc-reward__star', filled && 'puc-reward__star--on', dim && 'puc-reward__star--dim')}
      aria-hidden="true"
    >
      <path
        d="M12 2.5 14.8 9 22 9.8l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.4L2 9.8 9.2 9z"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  )
}
