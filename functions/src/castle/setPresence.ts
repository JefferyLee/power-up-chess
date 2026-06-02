// setPresence — called every ~20 s by the Hall while it's mounted.
//
// Also writes a chat_identity/{uid} shadow doc that postChat reads — this
// is what authenticates a chat message's claimed identity. By tying the
// identity decision to presence-heartbeat we avoid every chat needing the
// guest doc lookup on every call.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { LocationTag, SetPresenceRequest, SetPresenceResponse, PresenceDoc } from './chatTypes'
import type { GuestDoc } from './types'
import { hostOnDuty } from '../shared/hostOnDuty'

interface FullPresenceRequest extends SetPresenceRequest {
  displayName: string
  normalizedName: string
  isBypass: boolean
}

export const setPresence = onCall<FullPresenceRequest, Promise<SetPresenceResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before joining the Hall.')
    const uid = req.auth.uid

    const sessionId = String(req.data?.sessionId ?? '').trim()
    const displayName = String(req.data?.displayName ?? '').trim().slice(0, 40)
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const isBypass = req.data?.isBypass === true

    if (!sessionId || sessionId.length > 40) throw new HttpsError('invalid-argument', 'Bad sessionId.')
    if (!displayName) throw new HttpsError('invalid-argument', 'displayName required.')

    // Server decides the host on duty — same for every visitor at this instant.
    const hostId = hostOnDuty()

    const db = getFirestore()
    let hasHalo = false
    // Verify non-bypass identity against the guest doc + read cosmetic state.
    if (!isBypass) {
      if (!normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required for non-bypass guests.')
      const guestSnap = await db.doc(`guests/${normalizedName}`).get()
      const guest = guestSnap.data() as GuestDoc | undefined
      if (!guest || !guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only set presence as yourself.')
      }
      const halo = guest.cosmetics?.duelWinnerExpiresAt
      hasHalo = typeof halo === 'number' && halo > Date.now()
    }

    const now = Date.now()
    const location = sanitiseLocation(req.data?.location)
    const presence: PresenceDoc = {
      sessionId,
      displayName,
      normalizedName,
      uid,
      isBypass,
      hostId,
      lastSeenAt: now,
      ...(location ? { location } : {}),
      ...(hasHalo ? { hasHalo: true } : {}),
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

function sanitiseLocation(input: unknown): LocationTag | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as { kind?: unknown; roomId?: unknown }
  if (obj.kind === 'hall') return { kind: 'hall' }
  if (obj.kind === 'chess' || obj.kind === 'wizard') {
    const roomId = String(obj.roomId ?? '').trim().slice(0, 32)
    if (!roomId) return null
    return { kind: obj.kind, roomId }
  }
  return null
}
