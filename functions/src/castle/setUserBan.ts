// setUserBan — lightweight moderation ban (Phase 1.3, admin-only).
//
// Sets `banned` on the guest doc (checked by postChat, setPresence and the
// Wizard chat callables) and mirrors the flag into banned_uids/{uid} for
// every auth uid linked to the guest, so a banned kid can't sidestep by
// dropping to a bypass session on the same devices. Unban reverses both.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from './types'

const ADMIN_NORMALIZED_NAME = 'jeff'

export interface SetUserBanRequest {
  normalizedName: string
  banned: boolean
}
export interface SetUserBanResponse {
  ok: boolean
  banned: boolean
  uidsFlagged: number
}

export const setUserBan = onCall<SetUserBanRequest, Promise<SetUserBanResponse>>({ enforceAppCheck: true },async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const db = getFirestore()

  const adminSnap = await db.doc(`guests/${ADMIN_NORMALIZED_NAME}`).get()
  const admin = adminSnap.data() as GuestDoc | undefined
  if (!admin || !admin.uids.includes(req.auth.uid)) {
    throw new HttpsError('permission-denied', 'Admin only.')
  }

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const banned = req.data?.banned === true
  if (!normalizedName || normalizedName.includes('/')) {
    throw new HttpsError('invalid-argument', 'Bad name.')
  }
  if (normalizedName === ADMIN_NORMALIZED_NAME) {
    throw new HttpsError('failed-precondition', 'Cannot ban the admin account.')
  }

  const guestRef = db.doc(`guests/${normalizedName}`)
  const guestSnap = await guestRef.get()
  const guest = guestSnap.data() as GuestDoc | undefined
  if (!guest) throw new HttpsError('not-found', 'No such guest.')

  const batch = db.batch()
  batch.update(guestRef, { banned })
  const uids = Array.isArray(guest.uids) ? guest.uids : []
  for (const uid of uids) {
    const ref = db.doc(`banned_uids/${uid}`)
    if (banned) batch.set(ref, { normalizedName, ts: Date.now() })
    else batch.delete(ref)
  }
  await batch.commit()
  return { ok: true, banned, uidsFlagged: uids.length }
})
