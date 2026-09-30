import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from './roomId'
import { sanitiseTimeControl } from './sanitiseTimeControl'
import type { CreateRoomRequest, CreateRoomResponse, RoomDoc } from './types'
import { AWARD_CAPS } from '../castle/types'
import { sanitisePieceSetId } from '../cosmetics/registry'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'
import { requireOwnedGuest } from '../castle/requireOwner'
import { APP_CHECK } from '../callableOptions'

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MAX_TRIES = 5

/**
 * Mints a new private game room with the caller as the white player.
 *
 * Auth: required (Anonymous Auth is fine).
 * Returns the freshly-minted roomId; the client builds the share URL from its
 * own origin (so we don't have to know the hosting domain server-side).
 */
export const createRoom = onCall<CreateRoomRequest, Promise<CreateRoomResponse>>(APP_CHECK,
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before creating a room.')
    }
    const uid = req.auth.uid
    const isBypass = req.data.isBypass === true
    const normalizedName = String(req.data.normalizedName ?? '').trim().toLowerCase()

    // Opening a room costs castle points; bypass guests have no balance,
    // so we refuse them up front and ask them to register a magic word.
    // (The request's displayName is ignored — the seat takes the
    // server-bound spelling from the guest doc below.)
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
    const cost = AWARD_CAPS.chessRoomOpenCost
    const callerIp = extractIp(req)

    // Charge + create atomically. Tx retries on collision OR contention; we
    // pre-generate room IDs per attempt so the whole transaction either
    // commits a fresh room + debits the points, or rolls back together.
    const whitePieceSetId = sanitisePieceSetId(req.data.pieceSetId)
    for (let i = 0; i < MAX_TRIES; i++) {
      const roomId = generateRoomId()
      const ref = db.doc(`rooms/${roomId}`)

      // Returns null on room-id collision so the outer loop retries with a
      // fresh id; throws HttpsError on real failures (not your name, no
      // guest, low balance).
      const committed = await db.runTransaction(async (tx) => {
        // Ownership + balance come from the same snapshot we debit; the
        // seat's displayName is the guest doc's, never the request's.
        const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx)
        if (guest.castlePoints < cost) {
          throw new HttpsError(
            'failed-precondition',
            `Need ${cost} castle points to open a room; you have ${guest.castlePoints}.`,
          )
        }
        const roomSnap = await tx.get(ref)
        if (roomSnap.exists) return false
        const doc: RoomDoc = {
          white: {
            playerId: uid,
            displayName: guest.displayName,
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
        tx.create(ref, doc)
        tx.update(guestRef, { castlePoints: FieldValue.increment(-cost) })
        appendAuditTx(tx, {
          normalizedName,
          uid,
          delta: -cost,
          before: guest.castlePoints,
          after: guest.castlePoints - cost,
          source: 'room-open:chess',
          metadata: { roomId },
          ...(callerIp ? { ip: callerIp } : {}),
        })
        return true
      })

      if (committed) {
        // Intentionally NO Hall post here. The "X just started a chess
        // game — watch them play" message fires from joinRoom once
        // both players are in, so the Hall doesn't fill with dead
        // links to never-joined rooms.
        return { roomId }
      }
    }

    throw new HttpsError('internal', 'Could not allocate a unique room ID; please retry.')
  },
)
