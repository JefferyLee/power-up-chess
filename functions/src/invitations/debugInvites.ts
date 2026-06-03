// TEMPORARY diagnostic callable. Returns the caller's current state +
// the most recent presence + the invitations targeting them. Use to
// figure out why an invite isn't landing in the recipient's inbox.
//
// Delete once the multi-uid invite bug is verified fixed.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import type { PresenceDoc } from '../castle/chatTypes'
import type { InvitationDoc } from './types'

export interface DebugInvitesResponse {
  authUid: string
  guestNormalizedName: string | null
  guestUids: string[]
  guestUidsMatchAuth: boolean
  recentPresenceForMe: Array<{ sessionId: string; uid: string; normalizedName: string; lastSeenAt: number }>
  pendingInvitesByToUidsContains: number
  pendingInvitesByToUidContains: number
  pendingInvitesToMyNormalizedName: Array<{
    inviteId: string
    fromName: string
    toUid: string
    toUids: string[]
    toUidsContainsMe: boolean
    toUidEqualsMe: boolean
  }>
}

export const debugInvites = onCall<{}, Promise<DebugInvitesResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in.')
    const uid = req.auth.uid
    const db = getFirestore()

    // Find this caller's guest doc — search guests by uid contains.
    const guestQuery = await db.collection('guests')
      .where('uids', 'array-contains', uid)
      .limit(1)
      .get()
    let guest: GuestDoc | null = null
    let guestNormalizedName: string | null = null
    if (!guestQuery.empty) {
      const snap = guestQuery.docs[0]!
      guest = snap.data() as GuestDoc
      guestNormalizedName = snap.id
    }

    // Recent presence for THIS uid (across whatever normalizedName it's
    // attached to in the presence collection — might or might not match
    // the guest we found).
    const presenceQuery = await db.collection('lobby/presence/items')
      .where('uid', '==', uid)
      .get()
    const recentPresence = presenceQuery.docs.map((d) => {
      const p = d.data() as PresenceDoc
      return {
        sessionId: p.sessionId ?? d.id,
        uid: p.uid,
        normalizedName: p.normalizedName,
        lastSeenAt: p.lastSeenAt,
      }
    })

    // What does each of the two invite-lookup paths return for this caller?
    const byArrayContains = await db.collection('invitations')
      .where('toUids', 'array-contains', uid)
      .where('status', '==', 'pending')
      .get()
    const byToUidEq = await db.collection('invitations')
      .where('toUid', '==', uid)
      .where('status', '==', 'pending')
      .get()

    // What pending invites name the caller's normalizedName as recipient,
    // regardless of which uid they were addressed to?
    const toMyName = guestNormalizedName
      ? await db.collection('invitations')
          .where('toNormalizedName', '==', guestNormalizedName)
          .where('status', '==', 'pending')
          .get()
      : null
    const toMyNameDocs = toMyName?.docs.map((d) => {
      const inv = d.data() as InvitationDoc
      return {
        inviteId: d.id,
        fromName: inv.fromName,
        toUid: inv.toUid,
        toUids: inv.toUids ?? [],
        toUidsContainsMe: (inv.toUids ?? []).includes(uid),
        toUidEqualsMe: inv.toUid === uid,
      }
    }) ?? []

    return {
      authUid: uid,
      guestNormalizedName,
      guestUids: guest?.uids ?? [],
      guestUidsMatchAuth: (guest?.uids ?? []).includes(uid),
      recentPresenceForMe: recentPresence,
      pendingInvitesByToUidsContains: byArrayContains.size,
      pendingInvitesByToUidContains: byToUidEq.size,
      pendingInvitesToMyNormalizedName: toMyNameDocs,
    }
  },
)
