// submitPuzzleAttempt — record a puzzle attempt, update the kid's
// per-plot ELO, award castle points, push onto the seen-set.
//
// All four writes (guest rating, seen list, stats, points) happen in one
// transaction so a partial failure can't leave the rating updated but
// the points missing.
//
// Bypass guests don't get persisted state — we no-op gracefully so the
// client UX still works.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import {
  DEFAULT_RATING,
  ELO_K,
  PUZZLE_POINTS,
  RATING_MAX,
  RATING_MIN,
  SEEN_CAP,
  type PuzzleDoc,
  type SubmitPuzzleAttemptRequest,
  type SubmitPuzzleAttemptResponse,
} from './types'
import { DAILY_BONUS_POINTS, laDayKey } from './dailyFive'

export const submitPuzzleAttempt = onCall<
  SubmitPuzzleAttemptRequest,
  Promise<SubmitPuzzleAttemptResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const puzzleId = String(req.data?.puzzleId ?? '').trim()
  const success = req.data?.success === true
  if (!puzzleId) throw new HttpsError('invalid-argument', 'puzzleId required.')

  const db = getFirestore()
  const puzzleSnap = await db.doc(`puzzles/${puzzleId}`).get()
  const puzzle = puzzleSnap.data() as PuzzleDoc | undefined
  if (!puzzle) throw new HttpsError('not-found', 'Puzzle not found.')

  // Bypass / unsigned-in path: no persisted state, but return a coherent
  // shape so the client UI keeps working.
  if (!normalizedName) {
    const synthetic = ratingAfter(DEFAULT_RATING, puzzle.difficulty, success)
    return {
      ok: true,
      plot: puzzle.plot,
      ratingBefore: DEFAULT_RATING,
      ratingAfter: synthetic,
      puzzleRating: puzzle.difficulty,
      castlePointsAdded: 0,
      castlePoints: 0,
      legends: puzzle.legends,
    }
  }

  const guestRef = db.doc(`guests/${normalizedName}`)
  const result = await db.runTransaction(async (tx) => {
    const guestSnap = await tx.get(guestRef)
    const guest = guestSnap.data() as GuestDoc | undefined
    if (!guest || !guest.uids.includes(req.auth!.uid)) {
      throw new HttpsError(
        'permission-denied',
        'You can only post attempts as yourself.',
      )
    }

    const prior = guest.puzzleRatings?.[puzzle.plot] ?? DEFAULT_RATING
    const newRating = ratingAfter(prior, puzzle.difficulty, success)

    // Push onto seen-set, trim to cap. The order matters — most-recent last.
    const seenBefore = guest.puzzleSeen ?? []
    const seenSet = new Set(seenBefore)
    seenSet.delete(puzzle.id)
    seenSet.add(puzzle.id)
    const seenAfter = Array.from(seenSet)
    const trimmed = seenAfter.length > SEEN_CAP
      ? seenAfter.slice(seenAfter.length - SEEN_CAP)
      : seenAfter

    // Points only on a successful solve.
    let pointsAdded = 0
    if (success) {
      if (puzzle.legends) {
        pointsAdded = PUZZLE_POINTS.legends
      } else if (puzzle.difficulty - prior >= 100) {
        pointsAdded = PUZZLE_POINTS.stretch
      } else {
        pointsAdded = PUZZLE_POINTS.atLevel
      }
    }

    const nextStats = {
      attempted: (guest.puzzleStats?.attempted ?? 0) + 1,
      solved: (guest.puzzleStats?.solved ?? 0) + (success ? 1 : 0),
    }

    // Today's-solves counter for the gate's live pulse. Lazily reset
    // when the day rolls over so we don't need a separate cron.
    let nextPuzzleSolvesToday = guest.puzzleSolvesToday
    if (success) {
      const today = laDayKey(Date.now())
      const cur = guest.puzzleSolvesToday
      nextPuzzleSolvesToday =
        cur && cur.dayKey === today
          ? { count: cur.count + 1, dayKey: today }
          : { count: 1, dayKey: today }
    }

    // Today's Five hook — if this puzzle is in today's slate, record the
    // slot result + fire the +10 completion bonus on the 5th attempt.
    let dailyCompletedNow = false
    let dailyBonusAdded = 0
    const today = laDayKey(Date.now())
    let nextDaily = guest.puzzleDaily
    if (
      nextDaily &&
      nextDaily.dayKey === today &&
      Array.isArray(nextDaily.puzzleIds)
    ) {
      const slot = nextDaily.puzzleIds.indexOf(puzzle.id)
      if (slot >= 0) {
        const newResults = [...nextDaily.results]
        // First attempt for the slot wins — subsequent attempts shouldn't
        // overwrite a true with a later false.
        if (newResults[slot] === null || newResults[slot] === undefined) {
          newResults[slot] = success
        }
        const allDone = newResults.every((r) => r !== null && r !== undefined)
        const shouldPayBonus = allDone && nextDaily.completionBonusPaid !== true
        nextDaily = {
          ...nextDaily,
          results: newResults,
          completionBonusPaid: shouldPayBonus ? true : nextDaily.completionBonusPaid,
        }
        if (shouldPayBonus) {
          dailyCompletedNow = true
          dailyBonusAdded = DAILY_BONUS_POINTS
        }
      }
    }

    // Legends Hall badge tracking — push id once on first solve.
    let nextBadges = guest.puzzleLegendsBadges
    if (success && puzzle.legends) {
      const set = new Set(nextBadges ?? [])
      if (!set.has(puzzle.id)) {
        set.add(puzzle.id)
        nextBadges = Array.from(set)
      }
    }

    const totalPoints = pointsAdded + dailyBonusAdded

    const update: Record<string, unknown> = {
      [`puzzleRatings.${puzzle.plot}`]: newRating,
      puzzleSeen: trimmed,
      puzzleStats: nextStats,
      lastVisitAt: Date.now(),
    }
    if (nextDaily !== guest.puzzleDaily) update.puzzleDaily = nextDaily
    if (nextBadges !== guest.puzzleLegendsBadges) {
      update.puzzleLegendsBadges = nextBadges
    }
    if (nextPuzzleSolvesToday !== guest.puzzleSolvesToday) {
      update.puzzleSolvesToday = nextPuzzleSolvesToday
    }
    if (totalPoints > 0) {
      update.castlePoints = FieldValue.increment(totalPoints)
      update.lifetimeEarned = FieldValue.increment(totalPoints)
    }
    tx.update(guestRef, update)

    return {
      ratingBefore: prior,
      ratingAfter: newRating,
      pointsAdded,
      dailyCompletedNow,
      dailyBonusAdded,
      castlePointsAfter: guest.castlePoints + totalPoints,
    }
  })

  return {
    ok: true,
    plot: puzzle.plot,
    ratingBefore: result.ratingBefore,
    ratingAfter: result.ratingAfter,
    puzzleRating: puzzle.difficulty,
    castlePointsAdded: result.pointsAdded + result.dailyBonusAdded,
    castlePoints: result.castlePointsAfter,
    legends: puzzle.legends,
    dailyCompletedNow: result.dailyCompletedNow,
    dailyBonusAdded: result.dailyBonusAdded,
  }
})

/** Standard ELO update with K = ELO_K. Result `1` = solved, `0` = failed. */
function ratingAfter(playerRating: number, puzzleRating: number, success: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400))
  const actual = success ? 1 : 0
  const next = playerRating + ELO_K * (actual - expected)
  return Math.round(clamp(next, RATING_MIN, RATING_MAX))
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
