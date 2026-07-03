// Per-uid rate limit doc helpers, used by postChat and (the LLM-call side of)
// hostChatReply. Two windows per limit: a rolling minute and a calendar day.
//
// We store a single doc per uid + bucket: chat_rate_limits/{uid}_{bucket}.

import { getFirestore } from 'firebase-admin/firestore'

const MINUTE_MS = 60 * 1000
const FIVE_MIN_MS = 5 * MINUTE_MS
const DAY_MS = 24 * 60 * 60 * 1000

export type RateBucket =
  | 'chat-min'
  | 'chat-5min'
  | 'host-day'
  | 'story-min'
  | 'story-day'
  | 'ask-day'
  | 'report-day'
  | 'bypass-day'
  | 'sync-day'

const WINDOW_MS: Record<RateBucket, number> = {
  'chat-min': MINUTE_MS,
  'chat-5min': FIVE_MIN_MS,
  'host-day': DAY_MS,
  'story-min': MINUTE_MS,
  'story-day': DAY_MS,
  'ask-day': DAY_MS,
  'report-day': DAY_MS,
  'bypass-day': DAY_MS,
  'sync-day': DAY_MS,
}

interface CounterDoc {
  windowStart: number
  count: number
}

/** Check + atomically increment. Returns `{allowed, retryAfterMs}`. */
export async function bumpAndCheck(
  uid: string,
  bucket: RateBucket,
  limit: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const db = getFirestore()
  const ref = db.doc(`chat_rate_limits/${uid}_${bucket}`)
  const windowMs = WINDOW_MS[bucket]

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const now = Date.now()
    const data = snap.data() as CounterDoc | undefined
    const fresh = !data || now - data.windowStart >= windowMs
    const windowStart = fresh ? now : data!.windowStart
    const count = (fresh ? 0 : data!.count) + 1
    if (count > limit) {
      return { allowed: false as const, retryAfterMs: windowStart + windowMs - now }
    }
    tx.set(ref, { windowStart, count } satisfies CounterDoc)
    return { allowed: true as const }
  })
}
