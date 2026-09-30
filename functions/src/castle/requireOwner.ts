// requireOwnedGuest — the one ownership check every castle callable
// should run before it charges, seats or edits `guests/{normalizedName}`.
//
// A request's normalizedName / displayName are client-supplied and
// therefore untrusted: a modified client can name anyone. The guest doc
// is the source of truth — its `uids` array lists every anonymous-auth
// uid that has signed in with that name's magic word, and its
// `displayName` is the server-bound spelling. Callers take both from
// the returned doc, never from the request.
//
// Bypass guests have no guest doc, so they can never pass this check.
// That is intentional: everything that calls it costs or awards castle
// points, which bypass guests don't have.

import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import type { GuestDoc } from './types'

export interface OwnedGuest {
  ref: DocumentReference
  guest: GuestDoc
}

/**
 * Load `guests/{normalizedName}` and prove the caller owns it.
 *
 * Pass `tx` when the caller is inside a transaction that will go on to
 * debit or update the guest, so the ownership check and the write share
 * one snapshot. Throws HttpsError (permission-denied / failed-precondition)
 * with a kid-readable message; never returns for a name the caller
 * doesn't own.
 */
export async function requireOwnedGuest(
  db: Firestore,
  uid: string,
  normalizedName: string,
  tx?: Transaction,
): Promise<OwnedGuest> {
  const name = String(normalizedName ?? '').trim().toLowerCase()
  if (!name || name.includes('/')) {
    throw new HttpsError('permission-denied', 'Set a magic word in the castle gate first.')
  }
  const ref = db.doc(`guests/${name}`)
  const snap = tx ? await tx.get(ref) : await ref.get()
  const guest = snap.data() as GuestDoc | undefined
  if (!guest) {
    throw new HttpsError('failed-precondition', 'Guest record missing — sign in again.')
  }
  if (!Array.isArray(guest.uids) || !guest.uids.includes(uid)) {
    throw new HttpsError('permission-denied', 'You can only do that as yourself.')
  }
  return { ref, guest }
}
