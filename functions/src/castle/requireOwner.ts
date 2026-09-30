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

export interface OwnerCheckOptions {
  /** Client-supplied sessionId for callables under the single-active-
   *  session policy (H.7). When the guest doc carries an
   *  `activeSessionId` that differs, the caller is a stale device or
   *  tab — throws failed-precondition. Guests from before H.7 have no
   *  activeSessionId and pass. */
  sessionId?: string
}

function normalise(normalizedName: string): string | null {
  const name = String(normalizedName ?? '').trim().toLowerCase()
  return !name || name.includes('/') ? null : name
}

async function load(
  db: Firestore,
  name: string,
  tx?: Transaction,
): Promise<{ ref: DocumentReference; guest: GuestDoc | undefined }> {
  const ref = db.doc(`guests/${name}`)
  const snap = tx ? await tx.get(ref) : await ref.get()
  return { ref, guest: snap.data() as GuestDoc | undefined }
}

function owns(guest: GuestDoc, uid: string): boolean {
  return Array.isArray(guest.uids) && guest.uids.includes(uid)
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
  opts?: OwnerCheckOptions,
): Promise<OwnedGuest> {
  const name = normalise(normalizedName)
  if (!name) {
    throw new HttpsError('permission-denied', 'Set a magic word in the castle gate first.')
  }
  const { ref, guest } = await load(db, name, tx)
  if (!guest) {
    throw new HttpsError('failed-precondition', 'Guest record missing — sign in again.')
  }
  if (!owns(guest, uid)) {
    throw new HttpsError('permission-denied', 'You can only do that as yourself.')
  }
  if (
    opts?.sessionId !== undefined &&
    guest.activeSessionId &&
    guest.activeSessionId !== opts.sessionId
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Your session is no longer active. Please refresh.',
    )
  }
  return { ref, guest }
}

/**
 * Non-throwing sibling for callables that merely *personalise* their
 * answer when the caller owns the name (puzzle lists, library shelves,
 * recently-played). Returns null for a bad name, a missing doc or a
 * uid that isn't on it — the caller then serves the public view.
 */
export async function findOwnedGuest(
  db: Firestore,
  uid: string,
  normalizedName: string,
  tx?: Transaction,
): Promise<OwnedGuest | null> {
  const name = normalise(normalizedName)
  if (!name) return null
  const { ref, guest } = await load(db, name, tx)
  return guest && owns(guest, uid) ? { ref, guest } : null
}
