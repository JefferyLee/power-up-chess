// Calibration — onboarding ladder that seeds every plot rating in one
// shot instead of forcing the kid to grind ELO from DEFAULT_RATING.
//
// `getCalibrationSet` returns 5 puzzles at CALIBRATION_RUNGS ratings,
// spread across plots for variety. `submitCalibration` consumes the
// success pattern and writes a single seed rating to every plot.
//
// Seed-rating heuristic: the highest rung the kid solved, plus ~100 if
// they solved everything, minus ~200 if they solved nothing. Simple but
// gets a 1200-rated kid out of the 400-grind quickly.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import type { GuestDoc } from '../castle/types'
import {
  CALIBRATION_RUNGS,
  DEFAULT_RATING,
  PLOTS,
  RATING_MAX,
  RATING_MIN,
  type GetCalibrationSetRequest,
  type GetCalibrationSetResponse,
  type PuzzleDoc,
  type SubmitCalibrationRequest,
  type SubmitCalibrationResponse,
} from './types'

const RUNG_WINDOW = 75    // ± around each rung when picking a puzzle
const FETCH_PER_RUNG = 20

export const getCalibrationSet = onCall<
  GetCalibrationSetRequest,
  Promise<GetCalibrationSetResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const db = getFirestore()

  let alreadyCalibrated = false
  if (normalizedName) {
    const guest = (await db.doc(`guests/${normalizedName}`).get()).data() as
      | GuestDoc
      | undefined
    alreadyCalibrated = guest?.puzzleCalibrated === true
  }

  // Spread plots round-robin across rungs so the ladder samples variety,
  // not 5 forks in a row.
  const puzzles: PuzzleDoc[] = []
  for (let i = 0; i < CALIBRATION_RUNGS.length; i++) {
    const rung = CALIBRATION_RUNGS[i]!
    const plot = PLOTS[i % PLOTS.length]!
    const snap = await db
      .collection('puzzles')
      .where('plot', '==', plot)
      .where('legends', '==', false)
      .where('difficulty', '>=', Math.max(RATING_MIN, rung - RUNG_WINDOW))
      .where('difficulty', '<=', Math.min(RATING_MAX, rung + RUNG_WINDOW))
      .orderBy('difficulty')
      .limit(FETCH_PER_RUNG)
      .get()
    const docs = snap.docs.map((d) => d.data() as PuzzleDoc)
    if (docs.length === 0) {
      // Skip this rung rather than fail the whole ladder. The seed math
      // tolerates a missing entry.
      continue
    }
    puzzles.push(docs[Math.floor(Math.random() * docs.length)]!)
  }

  if (puzzles.length === 0) return { ok: false, reason: 'empty' }
  return { ok: true, puzzles, alreadyCalibrated }
})

export const submitCalibration = onCall<
  SubmitCalibrationRequest,
  Promise<SubmitCalibrationResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const results = Array.isArray(req.data?.results) ? req.data!.results : []
  if (!normalizedName) {
    throw new HttpsError('invalid-argument', 'normalizedName required.')
  }
  if (results.length === 0 || results.length > CALIBRATION_RUNGS.length) {
    throw new HttpsError('invalid-argument', 'Bad results length.')
  }

  const seed = seedRatingFor(results)

  const db = getFirestore()
  await db.runTransaction(async (tx) => {
    const { ref: guestRef } = await requireOwnedGuest(db, req.auth!.uid, normalizedName, tx)
    const ratings: Record<string, number> = {}
    for (const plot of PLOTS) ratings[plot] = seed
    tx.update(guestRef, {
      puzzleRatings: ratings,
      puzzleCalibrated: true,
      lastVisitAt: FieldValue.serverTimestamp(),
    })
  })

  return { ok: true, seedRating: seed }
})

/** Map the 5-rung pass/fail pattern to a single starting rating.
 *  Strategy: highest rung solved + 75 if they solved the top, with a
 *  consolation 250 if they solved nothing so they don't grind from 400. */
function seedRatingFor(results: boolean[]): number {
  let highestSolved = -1
  for (let i = 0; i < results.length; i++) {
    if (results[i]) highestSolved = i
  }
  if (highestSolved < 0) return Math.max(DEFAULT_RATING, 250)
  const rung = CALIBRATION_RUNGS[highestSolved]!
  // Solved the top rung → assume there's headroom above it.
  const bonus = highestSolved === results.length - 1 ? 75 : 0
  return Math.min(RATING_MAX, Math.max(RATING_MIN, rung + bonus))
}
