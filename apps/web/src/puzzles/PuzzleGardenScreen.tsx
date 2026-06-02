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
  puzzleDaily?: {
    dayKey: string
    puzzleIds: string[]
    results: Array<boolean | null>
    completionBonusPaid?: boolean
  }
  puzzleLegendsBadges?: string[]
}

const MASTER_UNLOCK_SOLVES = 25
const LEGENDS_UNLOCK_SOLVES = 50

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

        {!!identity && !identity.isBypass && (
          <DailyStrip
            daily={state?.puzzleDaily ?? null}
            onOpen={() => navigate('/puzzles/daily')}
          />
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

        {!!identity && !identity.isBypass && (
          <>
            <ChallengeEntrance
              tier="master"
              label="Master's Atrium"
              icon="🥈"
              blurbUnlocked="Hundreds of 2500-3000 puzzles. Touch any plaque and warm up for the Legends."
              blurbLockedTpl={(have) =>
                `Unlocks at ${MASTER_UNLOCK_SOLVES} solves — you have ${have}.`
              }
              unlocked={stats.solved >= MASTER_UNLOCK_SOLVES}
              solved={stats.solved}
              onEnter={() => navigate('/puzzles/master')}
            />
            <ChallengeEntrance
              tier="legend"
              label="Legends Hall"
              icon="🏛️"
              blurbUnlocked={`100 master-tier puzzles. Solve any for a permanent gold badge. (${state?.puzzleLegendsBadges?.length ?? 0} earned)`}
              blurbLockedTpl={(have) =>
                `Unlocks at ${LEGENDS_UNLOCK_SOLVES} solves — you have ${have}.`
              }
              unlocked={stats.solved >= LEGENDS_UNLOCK_SOLVES}
              solved={stats.solved}
              onEnter={() => navigate('/puzzles/legends')}
            />
          </>
        )}
      </main>
    </div>
  )
}

function DailyStrip({
  daily,
  onOpen,
}: {
  daily: GuestPuzzleState['puzzleDaily'] | null
  onOpen: () => void
}) {
  const slots: Array<boolean | null> =
    daily && Array.isArray(daily.results) && daily.results.length === 5
      ? daily.results
      : [null, null, null, null, null]
  const allDone = slots.every((r) => r !== null && r !== undefined)
  const solved = slots.filter((r) => r === true).length
  return (
    <button
      type="button"
      className={
        'puc-garden__daily ' + (allDone ? 'puc-garden__daily--done' : '')
      }
      onClick={onOpen}
    >
      <div className="puc-garden__daily-body">
        <div className="puc-garden__daily-title">
          {allDone ? "Today's Five — done!" : "Today's Five"}
        </div>
        <div className="puc-garden__daily-sub">
          {allDone
            ? `${solved} of 5 solved — come back tomorrow`
            : 'Hand-picked daily quest, +10 castle-point bonus on completion'}
        </div>
      </div>
      <div className="puc-garden__daily-stones" aria-hidden="true">
        {slots.map((r, i) => (
          <span
            key={i}
            className={
              'puc-garden__daily-stone ' +
              (r === true
                ? 'puc-garden__daily-stone--solved'
                : r === false
                  ? 'puc-garden__daily-stone--failed'
                  : 'puc-garden__daily-stone--pending')
            }
          />
        ))}
      </div>
    </button>
  )
}

function ChallengeEntrance({
  tier,
  label,
  icon,
  blurbUnlocked,
  blurbLockedTpl,
  unlocked,
  solved,
  onEnter,
}: {
  tier: 'master' | 'legend'
  label: string
  icon: string
  blurbUnlocked: string
  blurbLockedTpl: (haveSolved: number) => string
  unlocked: boolean
  solved: number
  onEnter: () => void
}) {
  return (
    <button
      type="button"
      className={
        `puc-garden__legends puc-garden__legends--${tier} ` +
        (unlocked ? '' : 'puc-garden__legends--locked')
      }
      onClick={unlocked ? onEnter : undefined}
      disabled={!unlocked}
    >
      <div className="puc-garden__legends-icon" aria-hidden="true">{icon}</div>
      <div className="puc-garden__legends-body">
        <div className="puc-garden__legends-title">{label}</div>
        <div className="puc-garden__legends-blurb">
          {unlocked ? blurbUnlocked : blurbLockedTpl(solved)}
        </div>
      </div>
      <div className="puc-garden__legends-cta">
        {unlocked ? 'Enter →' : '🔒'}
      </div>
    </button>
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
