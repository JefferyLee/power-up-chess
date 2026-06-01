import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { RoomDoc } from './types'

export interface ClaimTimeWinRequest {
  roomId: string
}

export interface ClaimTimeWinResponse {
  ok: true
}

/**
 * The caller claims a win because their opponent's clock has expired.
 * Server validates by comparing serverNow - lastTickServerTs against the
 * opponent's stored remaining time. Idempotent: re-claiming a completed
 * room is a no-op success.
 */
export const claimTimeWin = onCall<ClaimTimeWinRequest, Promise<ClaimTimeWinResponse>>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before claiming a win.')
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

    // Re-claiming a finished game is fine — no-op.
    if (room.status === 'completed') return

    if (room.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Game is not in progress.')
    }
    if (!room.timeControl || room.lastTickServerTs === null) {
      throw new HttpsError('failed-precondition', 'This game has no clock.')
    }

    const isWhite = room.white.playerId === uid
    const isBlack = room.black?.playerId === uid
    if (!isWhite && !isBlack) {
      throw new HttpsError('permission-denied', 'You are not a player in this room.')
    }

    // Who is currently to move (i.e., whose clock is running)?
    const turn: 'w' | 'b' = room.currentFen.split(' ')[1] === 'b' ? 'b' : 'w'
    const callerIsToMove = (turn === 'w' && isWhite) || (turn === 'b' && isBlack)
    if (callerIsToMove) {
      // You can't claim a flag-fall while your own clock is the one ticking.
      throw new HttpsError('failed-precondition', 'It is your turn — you cannot claim time.')
    }

    const now = Date.now()
    const elapsed = now - room.lastTickServerTs
    const opponentTime = turn === 'w' ? (room.whiteTimeMs ?? 0) : (room.blackTimeMs ?? 0)
    if (elapsed < opponentTime) {
      throw new HttpsError('failed-precondition', 'Opponent has not run out of time.')
    }

    const winner: 'white' | 'black' = isWhite ? 'white' : 'black'
    const updated: RoomDoc = {
      ...room,
      status: 'completed',
      result: winner,
      endReason: 'timeout',
      whiteTimeMs: turn === 'w' ? 0 : room.whiteTimeMs,
      blackTimeMs: turn === 'b' ? 0 : room.blackTimeMs,
      lastTickServerTs: null,
      updatedAt: now,
    }
    tx.set(ref, updated)
  })

  return { ok: true }
})
