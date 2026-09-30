// setPrivacyPrefs — self-service privacy toggles (Phase 3.7). Currently one
// switch: hideFromLeaderboards, which keeps the guest off the gate top-5 and
// live pulse, the puzzle / Siege / Forest boards, the /users roster, and
// out of find-player search. The scheduled boards pick the change up within
// minutes; the Forest board is written per-run, so its row is cleared here.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import type { GuestDoc } from './types'

export interface SetPrivacyPrefsRequest {
  normalizedName: string
  hideFromLeaderboards: boolean
}
export interface SetPrivacyPrefsResponse {
  ok: boolean
  hideFromLeaderboards: boolean
}

export const setPrivacyPrefs = onCall<SetPrivacyPrefsRequest, Promise<SetPrivacyPrefsResponse>>(APP_CHECK,async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const hide = req.data?.hideFromLeaderboards === true
  if (!normalizedName || normalizedName.includes('/')) {
    throw new HttpsError('invalid-argument', 'Bad name.')
  }
  const db = getFirestore()
  const ref = db.doc(`guests/${normalizedName}`)
  const snap = await ref.get()
  const guest = snap.data() as GuestDoc | undefined
  if (!guest || !guest.uids.includes(uid)) {
    throw new HttpsError('permission-denied', 'You can only change your own settings.')
  }
  const batch = db.batch()
  batch.update(ref, { hideFromLeaderboards: hide })
  // Deleting a row that isn't there is a no-op, so no existence check.
  if (hide) batch.delete(db.doc(`forest_leaderboard/${normalizedName}`))
  await batch.commit()
  return { ok: true, hideFromLeaderboards: hide }
})
