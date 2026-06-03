// Send a chess invitation from one castle guest to another.
//
// Charges the sender 5 CP (INVITE_COST_CP) up-front whether or not the
// recipient ever accepts — same economics as opening a private room via
// the createRoom callable, since on accept we re-use that 5 CP to spawn
// the room.
//
// Recipient liveness ("are they online? in a game?") is a UI-level check
// at the sender's User Card. The server intentionally does NOT block on
// presence — the kid might be in a game, the invite still arrives, the
// recipient's client filters / queues it. This keeps the callable simple
// and avoids races where a kid joins a game half a second before the
// invite lands.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { consumeDailyQuota } from '../llm/rateLimit'
import { sanitiseTimeControl } from '../rooms/sanitiseTimeControl'
import type { TimeControl } from '../rooms/types'
import { INVITE_COST_CP, INVITE_DAILY_LIMIT, INVITE_TTL_MS, type InvitationDoc } from './types'

export interface SendInviteRequest {
  fromNormalizedName: string
  toNormalizedName: string
  timeControl: TimeControl | null
}

export interface SendInviteResponse {
  ok: true
  inviteId: string
  /** UTC ms; the client can countdown the 60 s decision window. */
  expiresAt: number
}

export const sendInvite = onCall<SendInviteRequest, Promise<SendInviteResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before sending an invitation.')
    }
    const fromNormalized = String(req.data?.fromNormalizedName ?? '').trim().toLowerCase()
    const toNormalized = String(req.data?.toNormalizedName ?? '').trim().toLowerCase()
    if (!fromNormalized || !toNormalized) {
      throw new HttpsError('invalid-argument', 'Both fromNormalizedName and toNormalizedName are required.')
    }
    if (fromNormalized === toNormalized) {
      throw new HttpsError('invalid-argument', 'You can\'t invite yourself.')
    }

    // sanitiseTimeControl throws HttpsError on out-of-range values; reuse so
    // invitations carry exactly the same TC shape as createRoom-sourced games.
    const timeControl = sanitiseTimeControl(req.data?.timeControl ?? null)

    const db = getFirestore()
    const fromRef = db.doc(`guests/${fromNormalized}`)
    const toRef = db.doc(`guests/${toNormalized}`)

    // Daily rate limit — same per-uid pattern as the feedback/commentary
    // limiters. The 5 CP cost is the primary deterrent; this is a backstop
    // against runaway clients (e.g. retry loops on a broken UI).
    await consumeDailyQuota(req.auth.uid, {
      collection: 'invite_attempts',
      limit: INVITE_DAILY_LIMIT,
      noun: 'invitations',
    })

    // Transaction: read both guest docs, verify, charge sender, create invite.
    const invitesCol = db.collection('invitations')
    const inviteRef = invitesCol.doc() // auto id

    const now = Date.now()
    const expiresAt = now + INVITE_TTL_MS
    // Pick the host server-side so neither client can spoof a preference.
    const hostMode: 'lucy' | 'luca' = Math.random() < 0.5 ? 'lucy' : 'luca'

    const result = await db.runTransaction(async (tx) => {
      const fromSnap = await tx.get(fromRef)
      if (!fromSnap.exists) {
        throw new HttpsError('failed-precondition', 'Sender guest record missing.')
      }
      const fromGuest = fromSnap.data() as GuestDoc
      if (!fromGuest.uids?.includes(req.auth!.uid)) {
        throw new HttpsError('permission-denied', 'You do not own this guest record.')
      }
      if (fromGuest.castlePoints < INVITE_COST_CP) {
        throw new HttpsError(
          'failed-precondition',
          `You need ${INVITE_COST_CP} castle points to send an invitation. You have ${fromGuest.castlePoints}.`,
        )
      }

      const toSnap = await tx.get(toRef)
      if (!toSnap.exists) {
        throw new HttpsError('not-found', 'That guest doesn\'t exist.')
      }
      const toGuest = toSnap.data() as GuestDoc
      const toUid = toGuest.uids?.[0]
      if (!toUid) {
        throw new HttpsError('failed-precondition', 'Recipient has no active session.')
      }

      const doc: InvitationDoc = {
        inviteId: inviteRef.id,
        fromUid: req.auth!.uid,
        fromName: fromGuest.displayName,
        fromNormalizedName: fromNormalized,
        toUid,
        toName: toGuest.displayName,
        toNormalizedName: toNormalized,
        timeControl,
        hostMode,
        status: 'pending',
        createdAt: now,
        expiresAt,
      }

      tx.update(fromRef, { castlePoints: FieldValue.increment(-INVITE_COST_CP) })
      tx.create(inviteRef, doc)
      return { inviteId: inviteRef.id, expiresAt }
    })

    return { ok: true, inviteId: result.inviteId, expiresAt: result.expiresAt }
  },
)
