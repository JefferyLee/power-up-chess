// In-app feedback channel — bug reports and suggestions go to Jeff's
// inbox, which is just the feedback collection plus a Firestore rule
// that lets the guest with normalizedName === 'jeff' read it.
//
// No email / 3rd-party service; the dev (Jeff) sees new feedback the
// next time he opens the Hall.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'

const ADMIN_NORMALIZED_NAME = 'jeff'
const RATE_LIMIT_PER_DAY = 8
const MAX_TEXT_LEN = 500
const MAX_ROUTE_LEN = 80
const DAY_MS = 24 * 60 * 60 * 1000

export type FeedbackKind = 'bug' | 'suggestion'

export interface FeedbackDoc {
  kind: FeedbackKind
  text: string
  /** The route/path the user was on when they submitted. Helps Jeff
   *  reproduce. */
  route: string
  /** Display name (snapshot — historical bubbles render consistently). */
  authorName: string
  /** Normalized name — empty for bypass guests. */
  authorNormalizedName: string
  /** Auth uid for moderation traceability. */
  authorUid: string
  /** True for bypass guests so Jeff can weight them lower. */
  authorIsBypass: boolean
  /** User-agent string so platform-specific issues are obvious. */
  userAgent: string
  ts: number
  read: boolean
}

interface RateRow {
  dayKey: number
  count: number
}

export interface SubmitFeedbackRequest {
  kind: FeedbackKind
  text: string
  route?: string
  userAgent?: string
  authorName?: string
  normalizedName?: string
  isBypass?: boolean
}

export interface SubmitFeedbackResponse {
  ok: true
  /** Server ts of the write so the client can show a nicer "thanks" toast. */
  ts: number
}

export const submitFeedback = onCall<
  SubmitFeedbackRequest,
  Promise<SubmitFeedbackResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid

  const kind = req.data?.kind
  if (kind !== 'bug' && kind !== 'suggestion') {
    throw new HttpsError('invalid-argument', 'kind must be "bug" or "suggestion".')
  }
  const text = String(req.data?.text ?? '').trim()
  if (text.length === 0) {
    throw new HttpsError('invalid-argument', 'Tell us what happened.')
  }
  if (text.length > MAX_TEXT_LEN) {
    throw new HttpsError(
      'invalid-argument',
      `Keep it under ${MAX_TEXT_LEN} characters.`,
    )
  }

  const route = String(req.data?.route ?? '').slice(0, MAX_ROUTE_LEN)
  const userAgent = String(req.data?.userAgent ?? '').slice(0, 240)
  const authorName = String(req.data?.authorName ?? '').slice(0, 40) || 'anon'
  const normalizedName = String(req.data?.normalizedName ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 40)
  const isBypass = req.data?.isBypass === true

  const db = getFirestore()
  const now = Date.now()
  const todayKey = Math.floor(now / DAY_MS)

  // Per-uid rate limit. Single transaction so concurrent submits can't
  // sneak past the cap.
  const rateRef = db.doc(`feedback_attempts/${uid}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef)
    const row = snap.data() as RateRow | undefined
    if (row && row.dayKey === todayKey && row.count >= RATE_LIMIT_PER_DAY) {
      throw new HttpsError(
        'resource-exhausted',
        `You've sent ${RATE_LIMIT_PER_DAY} pieces of feedback today — try again tomorrow.`,
      )
    }
    const next: RateRow =
      row && row.dayKey === todayKey
        ? { dayKey: todayKey, count: row.count + 1 }
        : { dayKey: todayKey, count: 1 }
    tx.set(rateRef, next)
  })

  const doc: FeedbackDoc = {
    kind,
    text,
    route,
    authorName,
    authorNormalizedName: normalizedName,
    authorUid: uid,
    authorIsBypass: isBypass,
    userAgent,
    ts: now,
    read: false,
  }
  await db.collection('feedback').add(doc)

  return { ok: true, ts: now }
})

export interface MarkFeedbackReadRequest {
  id: string
  read?: boolean
}

export const markFeedbackRead = onCall<MarkFeedbackReadRequest, Promise<{ ok: true }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const id = String(req.data?.id ?? '').trim()
    if (!id) throw new HttpsError('invalid-argument', 'id required.')

    const db = getFirestore()
    // Only Jeff can mark feedback read. Verify by reading the admin
    // guest doc + checking the caller's uid is on it.
    const adminSnap = await db.doc(`guests/${ADMIN_NORMALIZED_NAME}`).get()
    const admin = adminSnap.data() as GuestDoc | undefined
    if (!admin || !admin.uids.includes(req.auth.uid)) {
      throw new HttpsError('permission-denied', 'Inbox is reserved for the dev.')
    }

    const ref = db.doc(`feedback/${id}`)
    const exists = await ref.get()
    if (!exists.exists) throw new HttpsError('not-found', 'Feedback not found.')
    const read = req.data?.read !== false
    await ref.update({ read, readAt: read ? FieldValue.serverTimestamp() : null })
    return { ok: true }
  },
)

export interface DeleteFeedbackRequest {
  id: string
}

export const deleteFeedback = onCall<DeleteFeedbackRequest, Promise<{ ok: true }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const id = String(req.data?.id ?? '').trim()
    if (!id) throw new HttpsError('invalid-argument', 'id required.')

    const db = getFirestore()
    const adminSnap = await db.doc(`guests/${ADMIN_NORMALIZED_NAME}`).get()
    const admin = adminSnap.data() as GuestDoc | undefined
    if (!admin || !admin.uids.includes(req.auth.uid)) {
      throw new HttpsError('permission-denied', 'Inbox is reserved for the dev.')
    }

    const ref = db.doc(`feedback/${id}`)
    const exists = await ref.get()
    if (!exists.exists) throw new HttpsError('not-found', 'Feedback not found.')
    await ref.delete()
    return { ok: true }
  },
)
