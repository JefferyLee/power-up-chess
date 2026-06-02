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

    const update: Record<string, unknown> = {
      [`puzzleRatings.${puzzle.plot}`]: newRating,
      puzzleSeen: trimmed,
      puzzleStats: nextStats,
      lastVisitAt: Date.now(),
    }
    if (pointsAdded > 0) {
      update.castlePoints = FieldValue.increment(pointsAdded)
      update.lifetimeEarned = FieldValue.increment(pointsAdded)
    }
    tx.update(guestRef, update)

    return {
      ratingBefore: prior,
      ratingAfter: newRating,
      pointsAdded,
      castlePointsAfter: guest.castlePoints + pointsAdded,
    }
  })

  return {
    ok: true,
    plot: puzzle.plot,
    ratingBefore: result.ratingBefore,
    ratingAfter: result.ratingAfter,
    puzzleRating: puzzle.difficulty,
    castlePointsAdded: result.pointsAdded,
    castlePoints: result.castlePointsAfter,
    legends: puzzle.legends,
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
