// requireAdmin — the one admin gate for moderation / curation callables.
//
// Admin is a Firebase Auth custom claim (`admin: true`), granted once
// per uid with `node tools/admin/grant-admin.mjs <uid>`. It is NOT
// "whoever holds jeff's magic word": a magic word is a shared, kid-grade
// secret, and anonymous-auth uids are per device, so the claim is set on
// the specific uids Jeff signs in from. Firestore rules use the same
// claim (`request.auth.token.admin == true`).

import type { CallableRequest } from 'firebase-functions/v2/https'
import { HttpsError } from 'firebase-functions/v2/https'

/** True when the caller's ID token carries the admin claim. */
export function isAdmin(auth: CallableRequest['auth']): boolean {
  return auth?.token?.admin === true
}

/** Throws unless the caller is signed in and holds the admin claim. */
export function requireAdmin(
  auth: CallableRequest['auth'],
): asserts auth is NonNullable<CallableRequest['auth']> {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (!isAdmin(auth)) throw new HttpsError('permission-denied', 'Admin only.')
}
