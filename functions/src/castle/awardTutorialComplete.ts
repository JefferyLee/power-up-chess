// awardTutorialComplete — one-time reward for finishing the Chess
// Basics Tutorial (last lesson's outro click).
//
// Server enforces once-ever via guests/{name}.learnedBasicsAt. If
// the field already has a value, the call is a no-op. Bypass guests
// (no doc) never reach it: the client skips the call for them and the
// ownership check rejects a doc-less name.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { TUTORIAL_COMPLETE_REWARD } from './types'
import { appendAuditTx } from './audit'
import { extractIp } from './ipGeo'
import { requireOwnedGuest } from './requireOwner'

export interface AwardTutorialCompleteRequest {
  normalizedName: string
}

export interface AwardTutorialCompleteResponse {
  ok: true
  added: number
  castlePoints: number
  alreadyClaimed: boolean
}

export const awardTutorialComplete = onCall<
  AwardTutorialCompleteRequest,
  Promise<AwardTutorialCompleteResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  // Bypass guests have no doc — no-op.
  if (!normalizedName) {
    return { ok: true, added: 0, castlePoints: 0, alreadyClaimed: false }
  }

  const db = getFirestore()
  const callerIp = extractIp(req)

  return db.runTransaction(async (tx) => {
    const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx)
    if (typeof guest.learnedBasicsAt === 'number') {
      return {
        ok: true,
        added: 0,
        castlePoints: guest.castlePoints,
        alreadyClaimed: true,
      }
    }
    const reward = TUTORIAL_COMPLETE_REWARD
    tx.update(guestRef, {
      castlePoints: FieldValue.increment(reward),
      lifetimeEarned: FieldValue.increment(reward),
      learnedBasicsAt: Date.now(),
      lastVisitAt: Date.now(),
    })
    appendAuditTx(tx, {
      normalizedName,
      uid,
      delta: reward,
      before: guest.castlePoints,
      after: guest.castlePoints + reward,
      source: 'tutorial:complete',
      ...(callerIp ? { ip: callerIp } : {}),
    })
    return {
      ok: true,
      added: reward,
      castlePoints: guest.castlePoints + reward,
      alreadyClaimed: false,
    }
  })
})
