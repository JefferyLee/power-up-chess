// Phase 1A/1B — the guided learning entry point on the Hall's main column.
//
// FirstVisitGuide (1A): a one-time, skippable prompt for brand-new guests
// that offers the two sensible first steps (learn / today's puzzles) instead
// of dropping a first-timer in front of a dozen doors. It shows only while
// identity.isFirstVisit is set AND the kid hasn't dismissed it (localStorage),
// so it never nags on later visits.
//
// TodaysPractice (1B): a single "what should I do today" card that chains the
// day's three sensible actions — the Daily Five, a practice game (or, if games
// aren't unlocked yet, a nudge back to lessons to earn the points), and a
// one-tap review of the last game played. Replaces the bare DailyStrip so the
// kid has one obvious place to start.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DailyStrip, type DailyStripState } from '../puzzles/DailyStrip'
import { listGames } from '../history/api'
import type { SavedGame } from '../history/db'
import type { ReviewState } from '../screens/PostGameAnalysisScreen'
import './TodaysPractice.css'

const ONBOARD_SEEN_KEY = 'puc.onboardingSeen'

function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARD_SEEN_KEY, '1') } catch { /* private mode — fine */ }
}

/** 1A — first-visit funnel. Renders nothing once dismissed or on return visits. */
export function FirstVisitGuide({ isFirstVisit, hostName }: { isFirstVisit: boolean; hostName: string }) {
  const navigate = useNavigate()
  const [seen, setSeen] = useState(() => {
    try { return localStorage.getItem(ONBOARD_SEEN_KEY) === '1' } catch { return false }
  })
  if (!isFirstVisit || seen) return null

  const dismiss = () => { markOnboardingSeen(); setSeen(true) }
  const go = (to: string) => { dismiss(); navigate(to) }

  return (
    <section className="puc-firstguide" aria-label="Getting started">
      <p className="puc-firstguide__msg">
        <span className="puc-firstguide__host">{hostName}:</span>{' '}
        New here? I can teach you to play — or we can warm up with today&apos;s puzzles. Your pick!
      </p>
      <div className="puc-firstguide__btns">
        <button type="button" className="puc-firstguide__btn puc-firstguide__btn--primary" onClick={() => go('/learn')}>
          Teach me to play
        </button>
        <button type="button" className="puc-firstguide__btn" onClick={() => go('/puzzles/daily')}>
          Today&apos;s puzzles
        </button>
        <button type="button" className="puc-firstguide__btn puc-firstguide__btn--ghost" onClick={dismiss}>
          I&apos;ll look around
        </button>
      </div>
    </section>
  )
}

function relTime(ts: number, now: number): string {
  const day = 86_400_000
  const d0 = new Date(ts); d0.setHours(0, 0, 0, 0)
  const n0 = new Date(now); n0.setHours(0, 0, 0, 0)
  const days = Math.round((n0.getTime() - d0.getTime()) / day)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

/** 1B — "Today's practice" aggregation card. */
export function TodaysPractice({
  hostName,
  aiUnlocked,
  pointsToUnlock,
  puzzleDaily,
  onPractice,
  onOpenDaily,
}: {
  hostName: string
  aiUnlocked: boolean
  /** Points still needed to unlock playing games (0 when already unlocked). */
  pointsToUnlock: number
  puzzleDaily: DailyStripState | null
  /** Opens the Hall's time-control dialog for AI practice (the /ai route needs setup state). */
  onPractice: () => void
  onOpenDaily: () => void
}) {
  const navigate = useNavigate()
  const [last, setLast] = useState<SavedGame | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let live = true
    listGames().then((games) => { if (live) setLast(games[0] ?? null) }).catch(() => { /* no history yet */ })
    return () => { live = false }
  }, [])

  const reviewLast = () => {
    if (!last) return
    const state: ReviewState = {
      pgn: last.pgn,
      hostId: last.hostId,
      whiteName: last.whiteName,
      blackName: last.blackName,
      award: false, // re-reviewing a past game grants nothing
    }
    navigate('/review', { state })
  }

  return (
    <section className="puc-today" aria-label="Today's practice">
      <h2 className="puc-today__title">Today&apos;s practice</h2>

      <DailyStrip daily={puzzleDaily} onOpen={onOpenDaily} compact />

      {aiUnlocked ? (
        <button type="button" className="puc-today__row" onClick={onPractice}>
          <span className="puc-today__glyph" aria-hidden="true">♞</span>
          <span className="puc-today__body">
            <span className="puc-today__row-title">Play a game with {hostName}</span>
            <span className="puc-today__row-sub">Gentle sparring — take your time.</span>
          </span>
          <span className="puc-today__cta" aria-hidden="true">Play →</span>
        </button>
      ) : (
        <button type="button" className="puc-today__row" onClick={() => navigate('/learn')}>
          <span className="puc-today__glyph" aria-hidden="true">📖</span>
          <span className="puc-today__body">
            <span className="puc-today__row-title">Learn &amp; earn {pointsToUnlock} more points</span>
            <span className="puc-today__row-sub">Lessons and puzzles unlock playing games.</span>
          </span>
          <span className="puc-today__cta" aria-hidden="true">Go →</span>
        </button>
      )}

      {last && (
        <button type="button" className="puc-today__row" onClick={reviewLast}>
          <span className="puc-today__glyph" aria-hidden="true">🔎</span>
          <span className="puc-today__body">
            <span className="puc-today__row-title">Look back at your last game</span>
            <span className="puc-today__row-sub">{last.whiteName} vs {last.blackName} · {relTime(last.playedAt, now)}</span>
          </span>
          <span className="puc-today__cta" aria-hidden="true">Review →</span>
        </button>
      )}
    </section>
  )
}
