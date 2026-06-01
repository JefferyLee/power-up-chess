import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { JoinRoomRequest, JoinRoomResponse, RoomDoc } from './types'

/**
 * Adds the caller as the black player and flips the room to `live`.
 *
 * Idempotent for the room's original creator (white) — calling joinRoom on
 * your own room is a no-op success so that returning to a waiting-room link
 * does not error.
 */
export const joinRoom = onCall<JoinRoomRequest, Promise<JoinRoomResponse>>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before joining a room.')
  }
  const roomId = (req.data.roomId ?? '').trim()
  if (!/^[A-Za-z0-9]{4,12}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Invalid room id.')
  }
  const displayName = (req.data.displayName ?? '').trim().slice(0, 32)
  if (displayName.length === 0) {
    throw new HttpsError('invalid-argument', 'displayName is required.')
  }

  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Room not found.')
    }
    const room = snap.data() as RoomDoc

    // Idempotent: white re-calling join is a no-op.
    if (room.white.playerId === req.auth!.uid) return room

    // Black re-calling join is also idempotent.
    if (room.black && room.black.playerId === req.auth!.uid) return room

    if (room.status !== 'waiting') {
      throw new HttpsError('failed-precondition', 'Room is no longer accepting players.')
    }
    if (room.black) {
      throw new HttpsError('failed-precondition', 'Room already has two players.')
    }

    const now = Date.now()
    const updated: RoomDoc = {
      ...room,
      black: { playerId: req.auth!.uid, displayName },
      status: 'live',
      // White is to move at game start, so white's clock starts ticking now.
      // For an untimed room, lastTickServerTs stays null.
      lastTickServerTs: room.timeControl ? now : null,
      updatedAt: now,
    }
    tx.set(ref, updated)
    return updated
  })

  return { roomId, status: result.status }
})
