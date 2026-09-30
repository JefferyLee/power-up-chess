// getLibraryShelves — returns the bookshelf data: per-book story
// counts, the kid's read-progress, and the all-time heat counter.
//
// The structure is sourced from the static stories bundle (so it stays
// in sync with the client-side bundle). Heat reads from
// library_stats/{encoded-bookKey}. The kid's progress comes from the
// caller's GuestDoc.booksReadIds.

import { getFirestore } from 'firebase-admin/firestore'
import { onCall } from 'firebase-functions/v2/https'
import { findOwnedGuest } from '../castle/requireOwner'
import { loadBundle } from '../castle/storyBank'

const FALLBACK_BOOK_KEY = 'Other tales'

interface BookShelfEntry {
  bookKey: string
  author?: string
  /** All story ids in this book — client doesn't need them when
   *  rendering the shelf, but pre-shipping them avoids a second
   *  bundle read at drawer-open time. */
  storyIds: string[]
  totalStories: number
  /** All-time read count across all guests. 0 when no one has ever
   *  read a story in this book. */
  reads: number
  /** How many of this book's stories the caller has finished reading.
   *  0 for bypass / new guests. */
  kidReadCount: number
}

export interface GetLibraryShelvesResponse {
  /** Sorted: alpha by bookKey, with "Other tales" pinned at the end. */
  shelves: BookShelfEntry[]
  /** Total stories the caller has read across all books — same value
   *  the Adventurer's Plaque shows. */
  totalKidReads: number
  /** Total reads across the whole library, all-time. Useful as a
   *  denominator for "this book accounts for X% of all reads". */
  totalLibraryReads: number
}

function encodeKey(bookTitle: string): string {
  return encodeURIComponent(bookTitle)
}

export const getLibraryShelves = onCall<unknown, Promise<GetLibraryShelvesResponse>>(
  async (req) => {
    const bundle = loadBundle()
    const db = getFirestore()

    // ── 1. Group stories by book key — same logic as the client's
    //       groupByBook, so the order/contents match exactly.
    const byBook = new Map<string, { bookKey: string; author?: string; storyIds: string[] }>()
    for (const s of bundle.stories) {
      const bookKey = s.source.book ?? FALLBACK_BOOK_KEY
      const existing = byBook.get(bookKey)
      if (existing) {
        existing.storyIds.push(s.id)
      } else {
        byBook.set(bookKey, { bookKey, author: s.source.author, storyIds: [s.id] })
      }
    }
    const bookKeys = Array.from(byBook.keys())

    // ── 2. Caller's read set — empty for bypass / unauth.
    let kidReadIds: Set<string> = new Set()
    if (req.auth) {
      const uid = req.auth.uid
      const idSnap = await db.doc(`chat_identity/${uid}`).get()
      const idData = idSnap.data() as
        | { normalizedName: string; isBypass: boolean }
        | undefined
      if (idData && !idData.isBypass && idData.normalizedName) {
        const owned = await findOwnedGuest(db, uid, idData.normalizedName)
        if (owned && Array.isArray(owned.guest.booksReadIds)) {
          kidReadIds = new Set(owned.guest.booksReadIds)
        }
      }
    }

    // ── 3. Heat counters — one Firestore read per book, in parallel.
    //       Missing docs read as zero. Cap: 108 stories / ~10 books
    //       => ~10 reads, well below any quota concern.
    const heatSnaps = await Promise.all(
      bookKeys.map((k) => db.doc(`library_stats/${encodeKey(k)}`).get()),
    )
    const heatByBook = new Map<string, number>()
    for (let i = 0; i < bookKeys.length; i++) {
      const snap = heatSnaps[i]
      const reads = snap?.exists ? Number((snap.data() as { reads?: number })?.reads ?? 0) : 0
      heatByBook.set(bookKeys[i]!, Number.isFinite(reads) ? reads : 0)
    }

    // ── 4. Build response.
    const shelves: BookShelfEntry[] = []
    let totalKidReads = 0
    let totalLibraryReads = 0
    for (const bookKey of bookKeys) {
      const group = byBook.get(bookKey)!
      const reads = heatByBook.get(bookKey) ?? 0
      const kidReadCount = group.storyIds.reduce(
        (acc, id) => acc + (kidReadIds.has(id) ? 1 : 0),
        0,
      )
      totalKidReads += kidReadCount
      totalLibraryReads += reads
      shelves.push({
        bookKey,
        ...(group.author ? { author: group.author } : {}),
        storyIds: group.storyIds,
        totalStories: group.storyIds.length,
        reads,
        kidReadCount,
      })
    }

    // Same sort as client: alpha, "Other tales" last.
    shelves.sort((a, b) => {
      if (a.bookKey === FALLBACK_BOOK_KEY) return 1
      if (b.bookKey === FALLBACK_BOOK_KEY) return -1
      return a.bookKey.localeCompare(b.bookKey)
    })

    return { shelves, totalKidReads, totalLibraryReads }
  },
)
