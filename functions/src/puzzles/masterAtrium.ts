// Master's Atrium — high-difficulty challenge tier sitting just below
// Legends Hall. Returns every regular puzzle (legends == false) in the
// 2500-2999 rating band, plus the caller's solved set within that band
// (derived from puzzleSeen + the puzzle docs themselves on the client —
// here we just hand back which of OUR ids the caller has solved before).
//
// Gating: client hides the entrance until puzzleStats.solved >=
// MASTER_UNLOCK_SOLVES so casual visitors aren't dropped into 2500+
// territory with no chance.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { findOwnedGuest } from '../castle/requireOwner'
import type { PuzzleDoc } from './types'

export const MASTER_UNLOCK_SOLVES = 25
export const MASTER_BAND_MIN = 2500
export const MASTER_BAND_MAX = 2999

export interface GetMasterAtriumListRequest {
  normalizedName: string
}

export interface GetMasterAtriumListResponse {
  ok: true
  puzzles: PuzzleDoc[]
  /** Puzzle ids the caller has already solved (intersect of
   *  puzzleSeen with this band — best-effort signal for badges). */
  solved: string[]
  /** Total puzzle solves on the caller — drives the gate. */
  totalSolved: number
  /** Server-side unlock threshold so the client doesn't hard-code it. */
  unlockThreshold: number
}

export const getMasterAtriumList = onCall<
  GetMasterAtriumListRequest,
  Promise<GetMasterAtriumListResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const db = getFirestore()

  // All Master's Atrium puzzles. ~300 docs — pull in one query.
  const snap = await db
    .collection('puzzles')
    .where('legends', '==', false)
    .where('difficulty', '>=', MASTER_BAND_MIN)
    .where('difficulty', '<=', MASTER_BAND_MAX)
    .orderBy('difficulty')
    .get()
  const puzzles = snap.docs.map((d) => d.data() as PuzzleDoc)
  const puzzleIdSet = new Set(puzzles.map((p) => p.id))

  let totalSolved = 0
  let solved: string[] = []
  if (normalizedName) {
    const owned = await findOwnedGuest(db, req.auth.uid, normalizedName)
    if (owned) {
      totalSolved = owned.guest.puzzleStats?.solved ?? 0
      // puzzleSeen is "served-or-attempted", not "solved" — closest
      // signal we have without per-puzzle attempt history.
      const seen = owned.guest.puzzleSeen ?? []
      solved = seen.filter((id) => puzzleIdSet.has(id))
    }
  }

  return {
    ok: true,
    puzzles,
    solved,
    totalSolved,
    unlockThreshold: MASTER_UNLOCK_SOLVES,
  }
})
