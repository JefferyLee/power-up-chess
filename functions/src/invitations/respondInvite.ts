// Recipient responds to a chess invitation.
//
// Three outcomes, all once-only (status === 'pending' guard inside the txn):
//
//   accept  → spawns a fresh room with sender = white and accepter = black,
//             both seats pre-filled, status='live'. The 5 CP the inviter
//             paid at send time covers the room spawn — accepter pays nothing.
//   decline → status='declined'. Sender's 5 CP is gone. Done.
//   ignore  → status='ignored'. Same as decline economically; UI-side this
//             one means "I saw it but don't want to dignify a response."
//
// The recipient's client listens for status transitions on its inbox; on
// 'accepted' it reads roomId from the doc and navigates to /r/{roomId}.
// The sender's client mirrors that listener.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { generateRoomId } from '../rooms/roomId'
import type { RoomDoc } from '../rooms/types'
import type { InvitationDoc, InvitationStatus } from './types'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_ROOM_ID_TRIES = 5

export type InviteResponseKind = 'accept' | 'decline' | 'ignore'

export interface RespondInviteRequest {
  inviteId: string
  response: InviteResponseKind
}

export interface RespondInviteResponse {
  ok: true
  status: InvitationStatus
  /** Set only on accept — the spawned room's id. */
  roomId?: string
}

export const respondInvite = onCall<RespondInviteRequest, Promise<RespondInviteResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to respond to an invitation.')
    }
    const inviteId = String(req.data?.inviteId ?? '').trim()
    const response = req.data?.response
    if (!inviteId) {
      throw new HttpsError('invalid-argument', 'inviteId is required.')
    }
    if (response !== 'accept' && response !== 'decline' && response !== 'ignore') {
      throw new HttpsError('invalid-argument', 'response must be accept | decline | ignore.')
    }

    const db = getFirestore()
    const inviteRef = db.doc(`invitations/${inviteId}`)

    // Accept needs a unique room id. Pre-generate a few candidates so we can
    // pick one inside the txn without a query (txn reads can't be done after
    // a single failed create).
    const roomIdCandidates = Array.from({ length: MAX_ROOM_ID_TRIES }, () => generateRoomId())

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(inviteRef)
      if (!snap.exists) throw new HttpsError('not-found', 'Invitation not found.')
      const invite = snap.data() as InvitationDoc
      // The invite may have been sent to a previous device of the same
      // accepter (multi-uid magic-word account). Any uid in toUids is
      // legitimate. Keep toUid in the legacy single-string check for
      // back-compat with docs written before the array existed.
      const targets = invite.toUids ?? (invite.toUid ? [invite.toUid] : [])
      if (!targets.includes(req.auth!.uid)) {
        throw new HttpsError('permission-denied', 'This invitation was sent to someone else.')
      }
      if (invite.status !== 'pending') {
        // Already resolved — return idempotently so retries are safe.
        return { status: invite.status, roomId: invite.roomId }
      }
      if (Date.now() > invite.expiresAt) {
        tx.update(inviteRef, { status: 'expired' as InvitationStatus })
        throw new HttpsError('deadline-exceeded', 'This invitation has expired.')
      }

      if (response === 'decline' || response === 'ignore') {
        const status: InvitationStatus = response === 'decline' ? 'declined' : 'ignored'
        tx.update(inviteRef, { status })
        return { status }
      }

      // Accept path — read remaining preconditions inside the txn so other
      // simultaneous writes can't sneak past us.
      const accepterGuestRef = db.doc(`guests/${invite.toNormalizedName}`)
      const accepterSnap = await tx.get(accepterGuestRef)
      if (!accepterSnap.exists) {
        throw new HttpsError('failed-precondition', 'Accepter guest record missing.')
      }
      const accepter = accepterSnap.data() as GuestDoc

      // Find an unused room id. Reading until we hit a free slot — Firestore
      // refuses to .create() over an existing doc, but we use .get() in the
      // txn so we can branch.
      let chosenRoomId: string | null = null
      for (const candidate of roomIdCandidates) {
        const r = await tx.get(db.doc(`rooms/${candidate}`))
        if (!r.exists) { chosenRoomId = candidate; break }
      }
      if (!chosenRoomId) {
        throw new HttpsError('internal', 'Could not allocate a unique room id; please retry.')
      }

      const now = Date.now()
      const roomDoc: RoomDoc = {
        white: { playerId: invite.fromUid, displayName: invite.fromName },
        black: { playerId: req.auth!.uid, displayName: accepter.displayName },
        status: 'live',
        currentFen: STARTING_FEN,
        hostMode: invite.hostMode,
        theme: 'magic-forest',
        moves: [],
        timeControl: invite.timeControl,
        whiteTimeMs: invite.timeControl ? invite.timeControl.initialMs : null,
        blackTimeMs: invite.timeControl ? invite.timeControl.initialMs : null,
        // Clocks haven't started ticking; set on the FIRST move.
        lastTickServerTs: null,
        createdAt: now,
        updatedAt: now,
      }

      tx.create(db.doc(`rooms/${chosenRoomId}`), roomDoc)
      tx.update(inviteRef, {
        status: 'accepted' as InvitationStatus,
        roomId: chosenRoomId,
      })
      return { status: 'accepted' as InvitationStatus, roomId: chosenRoomId }
    })

    return { ok: true, ...result }
  },
)
