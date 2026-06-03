// Per-uid daily rate limit for LLM-cost callables (hostCommentary,
// gameRecap, and anything else we add later that costs $/call).
//
// Pattern: one Firestore doc per uid per limiter, holding {dayKey, count}.
// A single transaction checks-and-increments so concurrent calls can't
// sneak past the cap. The cache layer already absorbs same-input repeats;
// this is the second line of defence against a runaway loop or a stuck
// client retrying forever.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'

const DAY_MS = 24 * 60 * 60 * 1000

interface RateRow {
  dayKey: number
  count: number
}

export interface RateLimitOptions {
  /** Firestore collection holding one doc per uid. Different limiters use
   *  different collections so each cap is independent. */
  collection: string
  /** Hard daily ceiling per uid. */
  limit: number
  /** What to put in the error message — should describe the action the
   *  user just attempted ("commentary requests", "recaps", etc.). */
  noun: string
}

/** Throws HttpsError('resource-exhausted', ...) if `uid` has hit today's
 *  cap; otherwise increments the count and returns. Idempotent in the
 *  sense that the user gets a clean error and our database stays
 *  consistent under concurrent calls. */
export async function consumeDailyQuota(uid: string, opts: RateLimitOptions): Promise<void> {
  const db = getFirestore()
  const now = Date.now()
  const todayKey = Math.floor(now / DAY_MS)
  const ref = db.doc(`${opts.collection}/${uid}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const row = snap.data() as RateRow | undefined
    if (row && row.dayKey === todayKey && row.count >= opts.limit) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily ${opts.noun} cap (${opts.limit}) reached. Try again tomorrow.`,
      )
    }
    const next: RateRow =
      row && row.dayKey === todayKey
        ? { dayKey: todayKey, count: row.count + 1 }
        : { dayKey: todayKey, count: 1 }
    tx.set(ref, next)
  })
}

/** Lower-impact alternative for endpoints where we want to log usage but
 *  not block. (Not used yet — kept as a primitive for cheaper telemetry
 *  if we ever want it.) */
export async function bumpDailyCounter(uid: string, collection: string): Promise<void> {
  const db = getFirestore()
  const now = Date.now()
  const todayKey = Math.floor(now / DAY_MS)
  const ref = db.doc(`${collection}/${uid}`)
  await ref.set(
    { dayKey: todayKey, count: FieldValue.increment(1) },
    { merge: true },
  )
}
