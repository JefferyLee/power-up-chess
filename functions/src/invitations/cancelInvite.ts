// Sender bails on a pending invitation. NOT a refund — the 5 CP is gone.
// Used when the sender's UI closes the "waiting for response" toast, or
// the kid hits Cancel.
//
// We still write a final status so the recipient's onSnapshot doesn't keep
// the invite docked in the inbox; client filters can route 'cancelled' to
// silent dismissal.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { InvitationDoc, InvitationStatus } from './types'

export interface CancelInviteRequest {
  inviteId: string
}

export interface CancelInviteResponse {
  ok: true
  status: InvitationStatus
}

export const cancelInvite = onCall<CancelInviteRequest, Promise<CancelInviteResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in.')
    const inviteId = String(req.data?.inviteId ?? '').trim()
    if (!inviteId) throw new HttpsError('invalid-argument', 'inviteId is required.')

    const db = getFirestore()
    const ref = db.doc(`invitations/${inviteId}`)
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Invitation not found.')
      const invite = snap.data() as InvitationDoc
      if (invite.fromUid !== req.auth!.uid) {
        throw new HttpsError('permission-denied', 'Only the sender can cancel this invitation.')
      }
      if (invite.status !== 'pending') {
        // Idempotent — already resolved.
        return { status: invite.status }
      }
      tx.update(ref, { status: 'cancelled' as InvitationStatus })
      return { status: 'cancelled' as InvitationStatus }
    })

    return { ok: true, ...result }
  },
)
