// refreshPuzzleLeaderboards — scheduled aggregator for the Puzzle
// Garden's leaderboards. Every 5 minutes:
//
//   1. Scan every guest doc that has any puzzleRatings entry.
//   2. Detect ISO-week rollover (Monday 00:00 LA). If new week, batch-
//      copy puzzleRatings → puzzleWeekStarts on every guest so the
//      "this week's climbers" delta resets.
//   3. For each of 6 plots, compute:
//        - All-time tops: top 20 by absolute rating.
//        - Climbers:      top 20 by (rating - weekStart), ties broken
//                         by absolute rating, gain must be > 0.
//   4. Write one doc per plot to puzzle_leaderboards/{plot}.
//
// The client reads these 6 docs directly (no callable round-trip).

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { GuestDoc } from '../castle/types'
import { PLOTS, type Plot } from './types'

const TOP_N = 20
const PROJECT_TZ = 'America/Los_Angeles'

export interface LeaderboardEntry {
  displayName: string
  rating: number
  /** Present on the "climbers" list — rating - weekStart. Always > 0. */
  gain?: number
}

export interface PuzzleLeaderboardDoc {
  plot: Plot
  /** Sorted desc by absolute rating. */
  topAllTime: LeaderboardEntry[]
  /** Sorted desc by gain. Empty until at least one guest has gained
   *  this week. */
  topClimbers: LeaderboardEntry[]
  /** ISO-week key (YYYY-Www) of the current week — when this changes
   *  we know to roll baselines forward. */
  weekKey: string
  refreshedAt: number
}

export const refreshPuzzleLeaderboards = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 120, region: 'us-central1' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const weekKey = isoWeekKey(now, PROJECT_TZ)

    // Detect week rollover by reading any one existing leaderboard doc.
    const sample = await db.doc('puzzle_leaderboards/mate').get()
    const previousWeekKey = (sample.data() as PuzzleLeaderboardDoc | undefined)
      ?.weekKey
    const isNewWeek = previousWeekKey !== weekKey

    // Pull every guest doc — Firestore can't filter on "has puzzleRatings"
    // cheaply without an index, and the active-guest pool stays small
    // for the foreseeable future. We filter in memory.
    const allGuests = await db.collection('guests').get()
    const candidates = allGuests.docs
      .map((d) => d.data() as GuestDoc)
      .filter((g) => g && g.puzzleRatings && Object.keys(g.puzzleRatings).length > 0)
      .filter((g) => !g.hideFromLeaderboards) // Phase 3.7 privacy opt-out

    // Week rollover: batch-write puzzleWeekStarts = current ratings.
    // Do this BEFORE computing the new leaderboards so the climbers
    // list starts the week empty.
    if (isNewWeek && candidates.length > 0) {
      let batch = db.batch()
      let queued = 0
      for (const g of candidates) {
        batch.update(db.doc(`guests/${g.normalizedName}`), {
          puzzleWeekStarts: g.puzzleRatings,
        })
        queued++
        if (queued >= 400) {
          await batch.commit()
          batch = db.batch()
          queued = 0
        }
      }
      if (queued > 0) await batch.commit()
      // For the rest of this run, every climber's baseline equals their
      // current rating → gain is 0 → climbers list is empty. That's
      // correct — the week just started.
      for (const g of candidates) g.puzzleWeekStarts = { ...g.puzzleRatings }
    }

    // Build the 6 leaderboard docs.
    const writeBatch = db.batch()
    for (const plot of PLOTS) {
      const withRating = candidates
        .map((g) => {
          const rating = g.puzzleRatings?.[plot]
          if (typeof rating !== 'number') return null
          const baseline = g.puzzleWeekStarts?.[plot] ?? rating
          return {
            displayName: g.displayName,
            rating,
            gain: rating - baseline,
          }
        })
        .filter((e): e is { displayName: string; rating: number; gain: number } => e !== null)

      const topAllTime: LeaderboardEntry[] = withRating
        .slice()
        .sort((a, b) => b.rating - a.rating || a.displayName.localeCompare(b.displayName))
        .slice(0, TOP_N)
        .map(({ displayName, rating }) => ({ displayName, rating }))

      const topClimbers: LeaderboardEntry[] = withRating
        .filter((e) => e.gain > 0)
        .sort(
          (a, b) =>
            b.gain - a.gain ||
            b.rating - a.rating ||
            a.displayName.localeCompare(b.displayName),
        )
        .slice(0, TOP_N)
        .map(({ displayName, rating, gain }) => ({
          displayName,
          rating,
          gain,
        }))

      const doc: PuzzleLeaderboardDoc = {
        plot,
        topAllTime,
        topClimbers,
        weekKey,
        refreshedAt: now,
      }
      writeBatch.set(db.doc(`puzzle_leaderboards/${plot}`), doc)
    }
    await writeBatch.commit()
  },
)

/** ISO-8601 week key, e.g. "2026-W23". Computed in the given IANA
 *  timezone so a Monday rollover in LA happens at LA midnight, not UTC. */
function isoWeekKey(epochMs: number, tz: string): string {
  // Get y/m/d in the target tz via Intl.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs))
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  const d = Number(parts.find((p) => p.type === 'day')!.value)

  // Treat the LA-local Y-M-D as if it were UTC for ISO-week arithmetic.
  // ISO-week algorithm: find the Thursday of the same week, then count
  // weeks from the first Thursday of the year.
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayOfWeek = date.getUTCDay() || 7 // Sun=7 in ISO
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
