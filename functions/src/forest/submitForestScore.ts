// submitForestScore — persist a finished Forest Adventure run, update
// the global leaderboard, and (Phase E) pay out castle points scaled
// by the score.
//
// All four writes (run doc + leaderboard + guest castlePoints +
// dailyEarn bucket) happen inside one transaction so partial failures
// can't leave the leaderboard out of sync with the points record.
//
// Bypass guests don't reach this function (the client skips the call);
// if one does, we 200-no-op to keep the UX from breaking.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { AWARD_CAPS, UNLOCK_THRESHOLD, type GuestDailyEarn, type GuestDoc } from '../castle/types'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'

const MAX_SCORE = 200       // hard ceiling so a malicious client can't inflate
const MIN_SCORE = 0
const DAY_MS = 24 * 60 * 60 * 1000

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
  /** Castle points credited for this run (0 if score below the lowest
   *  payout tier OR daily cap already reached). */
  castlePointsAdded: number
  /** Guest's castle-point balance AFTER this run's payout. */
  castlePoints: number
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

/** Resolve a Forest score to its tier payout (the highest tier whose
 *  minScore the score meets). */
function payoutForScore(score: number): number {
  let pt = 0
  for (const tier of AWARD_CAPS.forestTiers) {
    if (score >= tier.minScore) pt = tier.pt
  }
  return pt
}

function emptyEarn(dayKey: number): GuestDailyEarn {
  return { dayKey, puzzle: 0, chessWin: 0, chessReview: 0, forest: 0 }
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
    const lbRef = db.doc(`forest_leaderboard/${normalizedName}`)
    const runRef = db.doc(`forest_runs/${uid}/runs/${runId}`)
    const now = Date.now()
    const todayKey = Math.floor(now / DAY_MS)
    const callerIp = extractIp(req)

    return db.runTransaction(async (tx) => {
      // ── Phase 1: reads ──────────────────────────────────────────────
      const [guestSnap, lbSnap] = await Promise.all([tx.get(guestRef), tx.get(lbRef)])
      const guest = guestSnap.data() as GuestDoc | undefined
      if (!guest) {
        // Bypass guest snuck through — no-op.
        return { ok: true as const, best: 0, improved: false, castlePointsAdded: 0, castlePoints: 0 }
      }
      if (!guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only submit scores for yourself.')
      }

      const prior = lbSnap.exists ? (lbSnap.data() as ForestLeaderboardDoc).best : 0
      const improved = score > prior

      // Daily-cap-aware castle-point payout.
      const tierPayout = payoutForScore(score)
      const earnBucket = guest.dailyEarn && guest.dailyEarn.dayKey === todayKey
        ? { ...guest.dailyEarn }
        : emptyEarn(todayKey)
      const earnedToday = earnBucket.forest ?? 0
      const headroom = Math.max(0, AWARD_CAPS.forestDailyMax - earnedToday)
      const castlePointsAdded = Math.min(tierPayout, headroom)

      // ── Phase 2: writes ─────────────────────────────────────────────
      tx.set(runRef, {
        runId,
        score,
        finishedAt: now,
        uid,
        displayName: guest.displayName,
      } satisfies ForestRunDoc)

      if (improved) {
        tx.set(lbRef, {
          normalizedName,
          displayName: guest.displayName,
          best: score,
          updatedAt: now,
        } satisfies ForestLeaderboardDoc)
      }

      const before = guest.castlePoints
      let castlePoints = before
      if (castlePointsAdded > 0) {
        earnBucket.forest = earnedToday + castlePointsAdded
        castlePoints = before + castlePointsAdded
        const lifetimePrev = guest.lifetimeEarned ?? Math.max(0, before)
        tx.update(guestRef, {
          castlePoints,
          dailyEarn: earnBucket,
          lifetimeEarned: lifetimePrev + castlePointsAdded,
        })
        appendAuditTx(tx, {
          normalizedName,
          uid,
          delta: castlePointsAdded,
          before,
          after: castlePoints,
          source: 'forest:run',
          metadata: { runId, score, improved },
          ...(callerIp ? { ip: callerIp } : {}),
        })
      } else if (guest.dailyEarn?.dayKey !== todayKey) {
        // Roll the bucket over to today even though no payout this run,
        // so the next puzzle/chess/forest call doesn't have to.
        tx.update(guestRef, { dailyEarn: earnBucket })
      }

      // Touch UNLOCK_THRESHOLD for parity with other paths (informational
      // only — castle-point UI surfaces this elsewhere).
      void UNLOCK_THRESHOLD

      return {
        ok: true as const,
        best: improved ? score : prior,
        improved,
        castlePointsAdded,
        castlePoints,
      }
    })
  },
)
