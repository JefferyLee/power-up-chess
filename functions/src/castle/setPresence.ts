// setPresence — called every ~20 s by the Hall while it's mounted.
//
// Also writes a chat_identity/{uid} shadow doc that postChat reads — this
// is what authenticates a chat message's claimed identity. By tying the
// identity decision to presence-heartbeat we avoid every chat needing the
// guest doc lookup on every call.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { SetPresenceRequest, SetPresenceResponse, PresenceDoc } from './chatTypes'
import type { GuestDoc } from './types'
import { isHostId, type HostId } from '../shared/hostId'

interface FullPresenceRequest extends SetPresenceRequest {
  displayName: string
  normalizedName: string
  hostId: HostId
  isBypass: boolean
}

export const setPresence = onCall<FullPresenceRequest, Promise<SetPresenceResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before joining the Hall.')
    const uid = req.auth.uid

    const sessionId = String(req.data?.sessionId ?? '').trim()
    const displayName = String(req.data?.displayName ?? '').trim().slice(0, 40)
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const hostId = req.data?.hostId
    const isBypass = req.data?.isBypass === true

    if (!sessionId || sessionId.length > 40) throw new HttpsError('invalid-argument', 'Bad sessionId.')
    if (!displayName) throw new HttpsError('invalid-argument', 'displayName required.')
    if (!hostId || !isHostId(hostId)) throw new HttpsError('invalid-argument', 'hostId must be lucy or luca.')

    const db = getFirestore()
    // Verify non-bypass identity against the guest doc.
    if (!isBypass) {
      if (!normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required for non-bypass guests.')
      const guestSnap = await db.doc(`guests/${normalizedName}`).get()
      const guest = guestSnap.data() as GuestDoc | undefined
      if (!guest || !guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only set presence as yourself.')
      }
    }

    const now = Date.now()
    const presence: PresenceDoc = {
      sessionId,
      displayName,
      normalizedName,
      uid,
      isBypass,
      hostId,
      lastSeenAt: now,
    }
    await db.doc(`lobby/presence/items/${sessionId}`).set(presence)

    // Shadow identity for postChat to authenticate quickly.
    await db.doc(`chat_identity/${uid}`).set(
      { displayName, normalizedName, isBypass, hostId, updatedAt: now },
      { merge: true },
    )

    return { ok: true }
  },
)
