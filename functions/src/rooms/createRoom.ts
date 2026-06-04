import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from './roomId'
import { sanitiseTimeControl } from './sanitiseTimeControl'
import type { CreateRoomRequest, CreateRoomResponse, RoomDoc } from './types'
import { postRoomInvite } from '../castle/postRoomInvite'
import { AWARD_CAPS, type GuestDoc } from '../castle/types'
import { sanitisePieceSetId } from '../cosmetics/registry'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_TRIES = 5

/**
 * Mints a new private game room with the caller as the white player.
 *
 * Auth: required (Anonymous Auth is fine).
 * Returns the freshly-minted roomId; the client builds the share URL from its
 * own origin (so we don't have to know the hosting domain server-side).
 */
export const createRoom = onCall<CreateRoomRequest, Promise<CreateRoomResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before creating a room.')
    }
    const displayName = (req.data.displayName ?? '').trim().slice(0, 32)
    if (displayName.length === 0) {
      throw new HttpsError('invalid-argument', 'displayName is required.')
    }
    const isBypass = req.data.isBypass === true
    const normalizedName = String(req.data.normalizedName ?? '').trim().toLowerCase()

    // Opening a room costs castle points; bypass guests have no balance,
    // so we refuse them up front and ask them to register a magic word.
    if (isBypass || !normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Bypass guests can\'t open private rooms. Set a magic word in the castle gate first.',
      )
    }

    // Host is decided server-side so neither player can pick it and both
    // players see the same one. Anything sent by the client is ignored.
    const hostMode: 'lucy' | 'luca' = Math.random() < 0.5 ? 'lucy' : 'luca'
    const timeControl = sanitiseTimeControl(req.data.timeControl ?? null)

    const db = getFirestore()
    const now = Date.now()
    const guestRef = db.doc(`guests/${normalizedName}`)
    const cost = AWARD_CAPS.chessRoomOpenCost

    // Charge + create atomically. Tx retries on collision OR contention; we
    // pre-generate room IDs per attempt so the whole transaction either
    // commits a fresh room + debits the points, or rolls back together.
    const whitePieceSetId = sanitisePieceSetId(req.data.pieceSetId)
    for (let i = 0; i < MAX_TRIES; i++) {
      const roomId = generateRoomId()
      const ref = db.doc(`rooms/${roomId}`)
      const doc: RoomDoc = {
        white: {
          playerId: req.auth.uid,
          displayName,
          ...(whitePieceSetId ? { pieceSetId: whitePieceSetId } : {}),
          normalizedName,
        },
        black: null,
        status: 'waiting',
        currentFen: STARTING_FEN,
        hostMode,
        theme: 'magic-forest',
        moves: [],
        timeControl,
        whiteTimeMs: timeControl ? timeControl.initialMs : null,
        blackTimeMs: timeControl ? timeControl.initialMs : null,
        lastTickServerTs: null,
        createdAt: now,
        updatedAt: now,
      }

      // Returns null on room-id collision so the outer loop retries with a
      // fresh id; throws HttpsError on real failures (no guest, low balance).
      const committed = await db.runTransaction(async (tx) => {
        const guestSnap = await tx.get(guestRef)
        if (!guestSnap.exists) {
          throw new HttpsError('failed-precondition', 'Guest record missing.')
        }
        const guest = guestSnap.data() as GuestDoc
        if (guest.castlePoints < cost) {
          throw new HttpsError(
            'failed-precondition',
            `Need ${cost} castle points to open a room; you have ${guest.castlePoints}.`,
          )
        }
        const roomSnap = await tx.get(ref)
        if (roomSnap.exists) return false
        tx.create(ref, doc)
        tx.update(guestRef, { castlePoints: FieldValue.increment(-cost) })
        return true
      })

      if (committed) {
        void postRoomInvite({ roomKind: 'chess', roomId, openerName: displayName })
        return { roomId }
      }
    }

    throw new HttpsError('internal', 'Could not allocate a unique room ID; please retry.')
  },
)
