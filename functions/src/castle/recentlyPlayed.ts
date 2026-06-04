// Helper to bump the recentlyPlayedWith list on a guest doc.
//
// Called from onRoomFinished (online chess) and respondInvite (on
// accept) — anywhere two named guests have just demonstrated they're
// playing together.
//
// Invariants:
//   • Newest entry sits at index 0, oldest is truncated past
//     RECENTLY_PLAYED_MAX.
//   • Reseeing the same opponent moves them to the front + updates
//     their displayName + ts, doesn't duplicate.
//   • Self-pairs are skipped (you don't show up in your own list).
//   • Both directions are bumped — A's list gets B and B's list gets A.

import type { Transaction } from 'firebase-admin/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { RECENTLY_PLAYED_MAX, type GuestDoc } from './types'

interface Pair {
  normalizedName: string
  displayName: string
}

/** Bump the recentlyPlayedWith entry on a guest doc inside an existing
 *  transaction. Caller must have already read the guest's snapshot via
 *  the same transaction (passed in as `guest`). */
export function appendRecentlyPlayedTx(
  tx: Transaction,
  guestRef: FirebaseFirestore.DocumentReference,
  guest: GuestDoc,
  partner: Pair,
  now: number,
): void {
  if (!partner.normalizedName || partner.normalizedName === guest.normalizedName) return
  const existing = Array.isArray(guest.recentlyPlayedWith) ? guest.recentlyPlayedWith : []
  const filtered = existing.filter((e) => e.normalizedName !== partner.normalizedName)
  const next = [
    { normalizedName: partner.normalizedName, displayName: partner.displayName, at: now },
    ...filtered,
  ].slice(0, RECENTLY_PLAYED_MAX)
  tx.update(guestRef, { recentlyPlayedWith: next })
}

/** Stand-alone bump that runs in its own transaction — useful from
 *  callables that aren't already inside one. Reads both guests, writes
 *  both. No-op if either doc is missing. */
export async function bumpRecentlyPlayedPair(a: Pair, b: Pair, now: number): Promise<void> {
  const db = getFirestore()
  const aRef = db.doc(`guests/${a.normalizedName}`)
  const bRef = db.doc(`guests/${b.normalizedName}`)
  await db.runTransaction(async (tx) => {
    const [aSnap, bSnap] = await Promise.all([tx.get(aRef), tx.get(bRef)])
    if (aSnap.exists) appendRecentlyPlayedTx(tx, aRef, aSnap.data() as GuestDoc, b, now)
    if (bSnap.exists) appendRecentlyPlayedTx(tx, bRef, bSnap.data() as GuestDoc, a, now)
  })
}
