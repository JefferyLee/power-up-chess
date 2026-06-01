import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { generateRoomId } from './roomId'
import type { CreateRoomRequest, CreateRoomResponse, RoomDoc } from './types'

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
    const hostMode = req.data.hostMode === 'luca' ? 'luca' : 'lucy'

    const db = getFirestore()
    const now = Date.now()

    // Try a few times in case of (extremely unlikely) ID collision.
    for (let i = 0; i < MAX_TRIES; i++) {
      const roomId = generateRoomId()
      const ref = db.doc(`rooms/${roomId}`)
      const doc: RoomDoc = {
        white: { playerId: req.auth.uid, displayName },
        black: null,
        status: 'waiting',
        currentFen: STARTING_FEN,
        hostMode,
        theme: 'magic-forest',
        moves: [],
        createdAt: now,
        updatedAt: now,
      }
      try {
        // .create() fails if the doc already exists — exactly the precondition we want.
        await ref.create(doc)
        return { roomId }
      } catch (err: unknown) {
        // Collision (ALREADY_EXISTS) → try again with a new ID.
        const code = (err as { code?: number | string }).code
        if (code === 6 || code === 'already-exists') continue
        throw err
      }
    }

    throw new HttpsError('internal', 'Could not allocate a unique room ID; please retry.')
  },
)
