// markStoryRead — records that a guest opened/listened to a story.
//
// Counts unique storyIds (booksReadIds) so re-opening the same story
// doesn't double-count. booksRead is the derived total kept in sync so
// the Adventurer's Plaque can render it without a length() compute.
//
// Bypass guests have no GuestDoc — silently no-op.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'

interface Request {
  storyId: string
}

interface Response {
  /** True if this call added a new id; false if already-read. */
  added: boolean
  booksRead: number
}

const MAX_STORY_ID_LEN = 120

export const markStoryRead = onCall<Request, Promise<Response>>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const storyId = String(req.data?.storyId ?? '').trim()
  if (!storyId || storyId.length > MAX_STORY_ID_LEN) {
    throw new HttpsError('invalid-argument', 'Invalid storyId.')
  }

  const db = getFirestore()
  // Same identity shadow doc that postChat / hostStoryAnswer use to
  // resolve the caller's normalizedName without trusting client input.
  const idSnap = await db.doc(`chat_identity/${uid}`).get()
  const idData = idSnap.data() as
    | { displayName: string; normalizedName: string; isBypass: boolean }
    | undefined
  if (!idData || idData.isBypass || !idData.normalizedName) {
    // Bypass / unknown — silently succeed so the client UI doesn't
    // need to special-case anonymous viewers.
    return { added: false, booksRead: 0 }
  }

  const guestRef = db.doc(`guests/${idData.normalizedName}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(guestRef)
    if (!snap.exists) return { added: false, booksRead: 0 }
    const guest = snap.data() as GuestDoc
    if (!guest.uids.includes(uid)) return { added: false, booksRead: 0 }
    const ids = Array.isArray(guest.booksReadIds) ? [...guest.booksReadIds] : []
    if (ids.includes(storyId)) {
      return { added: false, booksRead: ids.length }
    }
    ids.push(storyId)
    tx.update(guestRef, {
      booksReadIds: ids,
      booksRead: ids.length,
    })
    return { added: true, booksRead: ids.length }
  })
})
