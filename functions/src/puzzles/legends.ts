// Legends Hall — the 100-puzzle museum of 3000+ rated puzzles.
//
// getLegendsList returns every Legends puzzle (bounded at 100, so paging
// is overkill) plus the caller's solved-badge set. Gating: clients hide
// the entrance until puzzleStats.solved >= LEGENDS_UNLOCK_SOLVES.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { findOwnedGuest } from '../castle/requireOwner'
import type { PuzzleDoc } from './types'

export const LEGENDS_UNLOCK_SOLVES = 50

export interface GetLegendsListRequest {
  normalizedName: string
}

export interface GetLegendsListResponse {
  ok: true
  puzzles: PuzzleDoc[]
  /** Puzzle ids the caller has already solved. Stable, all-time. */
  solved: string[]
  /** Total puzzle solves on the caller — drives the gate. Always 0 for
   *  bypass guests. */
  totalSolved: number
  /** Server-side unlock threshold so the client doesn't hard-code it. */
  unlockThreshold: number
}

export const getLegendsList = onCall<
  GetLegendsListRequest,
  Promise<GetLegendsListResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const db = getFirestore()

  let solved: string[] = []
  let totalSolved = 0
  if (normalizedName) {
    const owned = await findOwnedGuest(db, req.auth.uid, normalizedName)
    if (owned) {
      solved = owned.guest.puzzleLegendsBadges ?? []
      totalSolved = owned.guest.puzzleStats?.solved ?? 0
    }
  }

  // All Legends puzzles — bounded at 100.
  const snap = await db
    .collection('puzzles')
    .where('legends', '==', true)
    .orderBy('difficulty')
    .get()
  const puzzles = snap.docs.map((d) => d.data() as PuzzleDoc)

  return {
    ok: true,
    puzzles,
    solved,
    totalSolved,
    unlockThreshold: LEGENDS_UNLOCK_SOLVES,
  }
})
