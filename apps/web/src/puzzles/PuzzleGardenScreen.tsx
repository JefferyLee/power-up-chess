// PuzzleGardenScreen — the garden map. Six plot cards, each routes to
// /puzzles/plot/:plot where the adaptive-serve loop takes over.
//
// Per-plot ratings come from the kid's guest doc (puzzleRatings). Bypass
// guests don't have ratings yet — cards show "—" and the plot screen
// will treat them as the default 400.

import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import type { Plot } from '../firebase/callables'
import './PuzzleGardenScreen.css'

interface PlotMeta {
  id: Plot
  label: string
  blurb: string
  emoji: string
}

const PLOTS: PlotMeta[] = [
  { id: 'mate',      label: 'Mate Meadow',         blurb: 'Find the mate.',        emoji: '👑' },
  { id: 'fork',      label: 'Fork Grove',          blurb: 'One move, two threats.', emoji: '🍴' },
  { id: 'pinSkewer', label: 'Pin & Skewer Vines',  blurb: 'Pin it. Skewer it.',     emoji: '📌' },
  { id: 'sacrifice', label: 'Sacrifice Garden',    blurb: 'Give to win.',           emoji: '💥' },
  { id: 'endgame',   label: 'Endgame Pond',        blurb: 'Promote and finish.',    emoji: '👑' },
  { id: 'defense',   label: "Defender's Thicket",  blurb: 'Find the only move.',    emoji: '🛡️' },
]

interface GuestPuzzleState {
  puzzleRatings?: Partial<Record<Plot, number>>
  puzzleCalibrated?: boolean
  puzzleStats?: { solved: number; attempted: number }
}

export function PuzzleGardenScreen() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const [state, setState] = useState<GuestPuzzleState | null>(null)

  // Live-subscribe to the guest doc so the plot cards update after a solve.
  useEffect(() => {
    if (!identity || identity.isBypass) {
      // Clearing state when the user is a bypass/signed-out — this is
      // an external-input-driven reset, not a derived computation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(null)
      return
    }
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as GuestPuzzleState | undefined
      setState(data ?? {})
    })
    return () => unsub()
  }, [identity])

  const ratings = state?.puzzleRatings ?? {}
  const stats = state?.puzzleStats ?? { solved: 0, attempted: 0 }
  const hasAnyRating = Object.keys(ratings).length > 0
  const isCalibrated = state?.puzzleCalibrated === true
  const isCalibrationCandidate =
    !!identity && !identity.isBypass && !isCalibrated && !hasAnyRating
  // Session-scoped dismissal so the banner doesn't keep nagging within
  // a single visit. A reload brings it back — by design, since it's a
  // genuinely useful onboarding step.
  const dismissed = sessionStorage.getItem('puc-cal-dismissed') === '1'
  const showCalibrationBanner = isCalibrationCandidate && !dismissed

  return (
    <div className="puc-garden">
      <header className="puc-garden__header">
        <button
          type="button"
          className="puc-garden__back"
          onClick={() => navigate('/')}
          aria-label="Back to menu"
        >
          ←
        </button>
        <h1 className="puc-garden__title">Puzzle Garden</h1>
        <button
          type="button"
          className="puc-garden__trophies"
          onClick={() => navigate('/puzzles/leaderboard')}
          aria-label="View trophies"
        >
          🏆 Trophies
        </button>
        <div className="puc-garden__total">
          <span className="puc-garden__total-label">Solved</span>
          <span className="puc-garden__total-value">{stats.solved}</span>
        </div>
      </header>

      <main className="puc-garden__main">
        {showCalibrationBanner && (
          <div className="puc-garden__calibrate" role="region" aria-label="Calibration">
            <div className="puc-garden__calibrate-body">
              <div className="puc-garden__calibrate-title">
                Find your level in 3 minutes
              </div>
              <div className="puc-garden__calibrate-blurb">
                Five quick puzzles tell us where to start serving you. Otherwise
                you&apos;ll grind from the easiest end.
              </div>
            </div>
            <div className="puc-garden__calibrate-actions">
              <button
                type="button"
                className="puc-garden__calibrate-btn puc-garden__calibrate-btn--primary"
                onClick={() => navigate('/puzzles/calibration')}
              >
                Start
              </button>
              <button
                type="button"
                className="puc-garden__calibrate-btn"
                onClick={() => {
                  sessionStorage.setItem('puc-cal-dismissed', '1')
                  // Re-render with the dismissal noticed.
                  setState((s) => (s ? { ...s } : s))
                }}
              >
                Maybe later
              </button>
            </div>
          </div>
        )}

        <p className="puc-garden__intro">
          Six plots, thousands of puzzles. Pick one — we&apos;ll serve puzzles at your level.
        </p>

        <div className="puc-garden__grid">
          {PLOTS.map((p) => (
            <PlotCard
              key={p.id}
              meta={p}
              rating={ratings[p.id]}
              onEnter={() => navigate(`/puzzles/plot/${p.id}`)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function PlotCard({
  meta,
  rating,
  onEnter,
}: {
  meta: PlotMeta
  rating: number | undefined
  onEnter: () => void
}) {
  return (
    <button type="button" className="puc-garden__card" onClick={onEnter}>
      <div className="puc-garden__card-icon" aria-hidden="true">
        {meta.emoji}
      </div>
      <div className="puc-garden__card-body">
        <div className="puc-garden__card-title">{meta.label}</div>
        <div className="puc-garden__card-blurb">{meta.blurb}</div>
        <div className="puc-garden__card-meta">
          <span className="puc-garden__card-rating-label">Your rating</span>
          <span className="puc-garden__card-rating-value">
            {rating ?? '—'}
          </span>
        </div>
      </div>
      <div className="puc-garden__card-cta" aria-hidden="true">
        Enter →
      </div>
    </button>
  )
}
