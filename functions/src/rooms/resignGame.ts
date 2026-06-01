import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { RoomDoc } from './types'

export interface ResignGameRequest {
  roomId: string
}

export interface ResignGameResponse {
  ok: true
}

/**
 * The caller resigns the game. Allowed from either player while the room is
 * live. The opposite color is recorded as the winner, endReason='resign'.
 */
export const resignGame = onCall<ResignGameRequest, Promise<ResignGameResponse>>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before resigning.')
  }
  const roomId = (req.data.roomId ?? '').trim()
  if (!/^[A-Za-z0-9]{4,12}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Invalid room id.')
  }

  const uid = req.auth.uid
  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
    const room = snap.data() as RoomDoc

    if (room.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Game is not in progress.')
    }

    const isWhite = room.white.playerId === uid
    const isBlack = room.black?.playerId === uid
    if (!isWhite && !isBlack) {
      throw new HttpsError('permission-denied', 'You are not a player in this room.')
    }

    const winner: 'white' | 'black' = isWhite ? 'black' : 'white'
    const updated: RoomDoc = {
      ...room,
      status: 'completed',
      result: winner,
      endReason: 'resign',
      updatedAt: Date.now(),
    }
    tx.set(ref, updated)
  })

  return { ok: true }
})
