// submitForestScore — persist a finished Forest Adventure run and update
// the per-user best score for the global leaderboard.
//
// Per MVP2_PLAN §2.7 + §7.4: Forest scores are SEPARATE from castle
// points — this function never touches guests/{name}.castlePoints.
//
// Bypass guests don't reach this function (the client skips the call);
// if one does, we 200-no-op to keep the UX from breaking.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'

const MAX_SCORE = 200       // hard ceiling so a malicious client can't inflate
const MIN_SCORE = 0

export interface SubmitForestScoreRequest {
  normalizedName: string
  runId: string
  score: number
}
export interface SubmitForestScoreResponse {
  ok: true
  best: number
  /** True if this run beat the prior best. */
  improved: boolean
}

interface ForestRunDoc {
  runId: string
  score: number
  finishedAt: number
  uid: string
  displayName: string
}

interface ForestLeaderboardDoc {
  normalizedName: string
  displayName: string
  best: number
  updatedAt: number
}

export const submitForestScore = onCall<SubmitForestScoreRequest, Promise<SubmitForestScoreResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before submitting scores.')
    const uid = req.auth.uid
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const runId = String(req.data?.runId ?? '').slice(0, 64)
    const rawScore = Number(req.data?.score)

    if (!normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required.')
    if (!runId) throw new HttpsError('invalid-argument', 'runId required.')
    if (!Number.isFinite(rawScore)) throw new HttpsError('invalid-argument', 'score must be a number.')

    const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.floor(rawScore)))
    const db = getFirestore()

    const guestRef = db.doc(`guests/${normalizedName}`)
    const guestSnap = await guestRef.get()
    const guest = guestSnap.data() as GuestDoc | undefined
    if (!guest) {
      // Bypass guest snuck through — no-op.
      return { ok: true, best: 0, improved: false }
    }
    if (!guest.uids.includes(uid)) {
      throw new HttpsError('permission-denied', 'You can only submit scores for yourself.')
    }

    // Write the run doc.
    await db.doc(`forest_runs/${uid}/runs/${runId}`).set({
      runId,
      score,
      finishedAt: Date.now(),
      uid,
      displayName: guest.displayName,
    } satisfies ForestRunDoc)

    // Update the per-user best in the leaderboard, only if improved.
    const lbRef = db.doc(`forest_leaderboard/${normalizedName}`)
    const lbSnap = await lbRef.get()
    const prior = lbSnap.exists ? (lbSnap.data() as ForestLeaderboardDoc).best : 0
    const improved = score > prior
    if (improved) {
      await lbRef.set({
        normalizedName,
        displayName: guest.displayName,
        best: score,
        updatedAt: Date.now(),
      } satisfies ForestLeaderboardDoc)
    }
    return { ok: true, best: improved ? score : prior, improved }
  },
)
