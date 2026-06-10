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
import { appendRecentlyPlayedTx } from '../castle/recentlyPlayed'
import { postGameStarted } from '../castle/postGameStarted'
import { wizardGateMinPoints } from '../games/wizard/wizardGate'
import { sanitisePieceSetId } from '../cosmetics/registry'
import { generateRoomId } from '../rooms/roomId'
import type { RoomDoc } from '../rooms/types'
import type { InvitationDoc, InvitationStatus } from './types'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_ROOM_ID_TRIES = 5
/** Wizard duel clock — kept in sync with createWizardRoom's constants. */
const WIZARD_INITIAL_MS = 8 * 60 * 1000
const WIZARD_INCREMENT_MS = 0

export type InviteResponseKind = 'accept' | 'decline' | 'ignore'

export interface RespondInviteRequest {
  inviteId: string
  response: InviteResponseKind
  /** Accepter's equipped piece-set. Stamped onto black.pieceSetId of the
   *  spawned room. Only used on the 'accept' path. */
  pieceSetId?: string
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

    // Pre-fetch the wizard gate threshold once, outside the txn. Cheap
    // single-doc read; lets the accept path enforce the gate without
    // a mid-txn dependent read. Unused for chess invites but the cost
    // of the unconditional fetch is negligible vs the branchy code.
    const wizardGate = await wizardGateMinPoints(db)

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
      // simultaneous writes can't sneak past us. Sender guest is also
      // read so we can bump both sides' recentlyPlayedWith list.
      const accepterGuestRef = db.doc(`guests/${invite.toNormalizedName}`)
      const senderGuestRef = db.doc(`guests/${invite.fromNormalizedName}`)
      const [accepterSnap, senderSnap] = await Promise.all([
        tx.get(accepterGuestRef),
        tx.get(senderGuestRef),
      ])
      if (!accepterSnap.exists) {
        throw new HttpsError('failed-precondition', 'Accepter guest record missing.')
      }
      const accepter = accepterSnap.data() as GuestDoc
      const sender = senderSnap.exists ? (senderSnap.data() as GuestDoc) : null

      const inviteKind: 'chess' | 'wizard' = invite.kind ?? 'chess'

      // Both sides must clear the wizard gate. Accepter is checked
      // here (defence in depth — sendInvite already checked the
      // sender + a snapshot of the recipient's balance, but a kid
      // could have spent points between the invite and the accept).
      if (inviteKind === 'wizard') {
        if (accepter.castlePoints < wizardGate) {
          throw new HttpsError(
            'failed-precondition',
            `Wizard's Duel unlocks at ${wizardGate} castle points; you have ${accepter.castlePoints}.`,
          )
        }
        if (sender && sender.castlePoints < wizardGate) {
          throw new HttpsError(
            'failed-precondition',
            `${invite.fromName} dropped below the ${wizardGate}-point duel threshold; the invite can no longer be accepted.`,
          )
        }
      }

      const roomCollection = inviteKind === 'wizard' ? 'wizard_rooms' : 'rooms'
      // Find an unused room id. Reading until we hit a free slot — Firestore
      // refuses to .create() over an existing doc, but we use .get() in the
      // txn so we can branch. Probe the same collection we're about to
      // write into so a chess id can't collide with a wizard id and
      // vice-versa.
      let chosenRoomId: string | null = null
      for (const candidate of roomIdCandidates) {
        const r = await tx.get(db.doc(`${roomCollection}/${candidate}`))
        if (!r.exists) { chosenRoomId = candidate; break }
      }
      if (!chosenRoomId) {
        throw new HttpsError('internal', 'Could not allocate a unique room id; please retry.')
      }

      const now = Date.now()
      const accepterPieceSetId = sanitisePieceSetId(req.data?.pieceSetId)

      if (inviteKind === 'wizard') {
        // Wizard rooms live in a sibling collection with a different
        // PlayerSlot shape (uid + isBypass) and a fixed clock. Spawn
        // directly as 'live' with both sides filled.
        const wizardRoomDoc = {
          white: {
            uid: invite.fromUid,
            displayName: invite.fromName,
            normalizedName: invite.fromNormalizedName,
            isBypass: false,
            ...(invite.fromPieceSetId ? { pieceSetId: invite.fromPieceSetId } : {}),
          },
          black: {
            uid: req.auth!.uid,
            displayName: accepter.displayName,
            normalizedName: invite.toNormalizedName,
            isBypass: false,
            ...(accepterPieceSetId ? { pieceSetId: accepterPieceSetId } : {}),
          },
          status: 'live' as const,
          fen: STARTING_FEN,
          currentTurn: 'w' as const,
          plyCount: 0,
          effects: [],
          actions: [],
          winner: null,
          endReason: null,
          timeControl: { initialMs: WIZARD_INITIAL_MS, incrementMs: WIZARD_INCREMENT_MS },
          whiteTimeMs: WIZARD_INITIAL_MS,
          blackTimeMs: WIZARD_INITIAL_MS,
          lastTickServerTs: now,
          createdAt: now,
          updatedAt: now,
        }
        tx.create(db.doc(`wizard_rooms/${chosenRoomId}`), wizardRoomDoc)
      } else {
        const roomDoc: RoomDoc = {
          white: {
            playerId: invite.fromUid,
            displayName: invite.fromName,
            ...(invite.fromPieceSetId ? { pieceSetId: invite.fromPieceSetId } : {}),
          },
          black: {
            playerId: req.auth!.uid,
            displayName: accepter.displayName,
            ...(accepterPieceSetId ? { pieceSetId: accepterPieceSetId } : {}),
          },
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
      }

      tx.update(inviteRef, {
        status: 'accepted' as InvitationStatus,
        roomId: chosenRoomId,
      })

      // Bump recently-played-with on both sides. Accepting an invite
      // is a clear "we're playing together" signal — front-load this
      // BEFORE the actual game finishes so the list updates the moment
      // a kid hits Accept.
      appendRecentlyPlayedTx(tx, accepterGuestRef, accepter, {
        normalizedName: invite.fromNormalizedName,
        displayName: invite.fromName,
      }, now)
      if (sender) {
        appendRecentlyPlayedTx(tx, senderGuestRef, sender, {
          normalizedName: invite.toNormalizedName,
          displayName: accepter.displayName,
        }, now)
      }

      return {
        status: 'accepted' as InvitationStatus,
        roomId: chosenRoomId,
        justAccepted: true as const,
        roomKind: inviteKind,
        whiteName: invite.fromName,
        blackName: accepter.displayName,
      }
    })

    // Only post the Hall message on a fresh accept (the create-the-room
    // path). Idempotent re-calls of an already-accepted invite carry
    // `justAccepted: false` and stay silent so retries don't spam.
    if ('justAccepted' in result && result.justAccepted && result.roomId) {
      void postGameStarted({
        roomKind: result.roomKind,
        roomId: result.roomId,
        whiteName: result.whiteName,
        blackName: result.blackName,
      })
    }

    return { ok: true, status: result.status, roomId: result.roomId }
  },
)
