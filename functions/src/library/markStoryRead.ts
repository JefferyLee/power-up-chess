// markStoryRead — records that a guest opened/listened to a story.
//
// Counts unique storyIds (booksReadIds) so re-opening the same story
// doesn't double-count. booksRead is the derived total kept in sync so
// the Adventurer's Plaque can render it without a length() compute.
//
// Bypass guests have no GuestDoc — silently no-op.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { loadBundle } from '../castle/storyBank'

/** "Other tales" — same fallback the client uses when source.book is missing. */
const FALLBACK_BOOK_KEY = 'Other tales'

function bookKeyForStory(storyId: string): string {
  const bundle = loadBundle()
  const story = bundle.stories.find((s) => s.id === storyId)
  return story?.source.book ?? FALLBACK_BOOK_KEY
}

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
  // The transaction touches only the guest doc. The library_stats
  // counter is bumped OUTSIDE the transaction with FieldValue.increment
  // — it's an aggregate that doesn't need atomicity with the per-guest
  // state, and keeping it out lets us still no-op cheaply when the
  // guest has already read this story.
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(guestRef)
    if (!snap.exists) return { added: false, booksRead: 0, bookKeyToBump: null as string | null }
    const guest = snap.data() as GuestDoc
    if (!guest.uids.includes(uid)) return { added: false, booksRead: 0, bookKeyToBump: null }
    const ids = Array.isArray(guest.booksReadIds) ? [...guest.booksReadIds] : []
    if (ids.includes(storyId)) {
      return { added: false, booksRead: ids.length, bookKeyToBump: null }
    }
    ids.push(storyId)
    tx.update(guestRef, {
      booksReadIds: ids,
      booksRead: ids.length,
    })
    return { added: true, booksRead: ids.length, bookKeyToBump: bookKeyForStory(storyId) }
  })

  // Heat counter — bump the book-level reads aggregate. We bump on
  // EVERY first-time story read (a kid reading 5 stories from "My
  // System" contributes 5 to that book's heat). This is the data the
  // bookshelf uses to size spines.
  if (result.added && result.bookKeyToBump) {
    try {
      await db.doc(`library_stats/${encodeKey(result.bookKeyToBump)}`).set(
        {
          bookKey: result.bookKeyToBump,
          reads: FieldValue.increment(1),
        },
        { merge: true },
      )
    } catch (err) {
      // Heat is best-effort — don't fail the user's read just because
      // the aggregate write hit a transient error.
      console.warn('markStoryRead: heat bump failed', err)
    }
  }

  return { added: result.added, booksRead: result.booksRead }
})

/** Book titles can contain characters Firestore doesn't allow in doc
 *  ids ('/'). Encode them. */
function encodeKey(bookTitle: string): string {
  return encodeURIComponent(bookTitle)
}
