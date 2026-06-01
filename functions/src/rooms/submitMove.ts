import { Chess } from 'chess.js'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { parseUci } from './parseUci'
import type { Move, RoomDoc, SubmitMoveRequest, SubmitMoveResponse } from './types'

/**
 * Server-authoritative move submission.
 *
 * Every move passes through here so chess.js is the single source of truth
 * for legality. The client cannot fake an illegal move, and cannot move out
 * of turn.
 */
export const submitMove = onCall<SubmitMoveRequest, Promise<SubmitMoveResponse>>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before submitting a move.')
  }
  const { roomId, moveIndex, uci, clientTs } = req.data
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9]{4,12}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Invalid room id.')
  }
  if (typeof moveIndex !== 'number' || moveIndex < 0 || !Number.isInteger(moveIndex)) {
    throw new HttpsError('invalid-argument', 'Invalid moveIndex.')
  }
  const parsed = parseUci(uci)
  if (!parsed) {
    throw new HttpsError('invalid-argument', 'Invalid uci.')
  }

  const uid = req.auth.uid
  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  const response = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
    const room = snap.data() as RoomDoc

    if (room.status !== 'live') {
      throw new HttpsError('failed-precondition', 'Room is not live.')
    }
    if (!room.black) {
      throw new HttpsError('failed-precondition', 'Room has no black player yet.')
    }
    const moves = room.moves ?? []
    if (moveIndex !== moves.length) {
      // Lost-update race: client tried to submit move N when N already exists.
      throw new HttpsError('aborted', `Move index out of sync (expected ${moves.length}).`)
    }

    // Replay the existing move list to reach the current position.
    const chess = new Chess()
    for (const m of moves) {
      const replay = chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
      if (!replay) {
        // Should never happen — would mean stored history is corrupted.
        throw new HttpsError('internal', 'Stored move history is invalid.')
      }
    }
    const fenBefore = chess.fen()

    // Whose turn is it? Match to the caller's color.
    const turn = chess.turn() // 'w' | 'b'
    const expectedUid = turn === 'w' ? room.white.playerId : room.black.playerId
    if (uid !== expectedUid) {
      throw new HttpsError('permission-denied', 'It is not your turn.')
    }

    const now = Date.now()

    // Clock enforcement (only if the room has a time control). The mover's
    // clock has been running since lastTickServerTs. If they ran out, the game
    // is over by timeout and we reject the move.
    let newWhiteTimeMs = room.whiteTimeMs
    let newBlackTimeMs = room.blackTimeMs
    if (room.timeControl && room.lastTickServerTs !== null) {
      const elapsed = now - room.lastTickServerTs
      if (turn === 'w') {
        const remaining = (room.whiteTimeMs ?? 0) - elapsed
        if (remaining <= 0) {
          // White flagged before completing the move.
          tx.set(ref, {
            ...room,
            status: 'completed',
            result: 'black',
            endReason: 'timeout',
            whiteTimeMs: 0,
            lastTickServerTs: null,
            updatedAt: now,
          } satisfies RoomDoc)
          throw new HttpsError('failed-precondition', 'Your time ran out.')
        }
        newWhiteTimeMs = remaining + room.timeControl.incrementMs
      } else {
        const remaining = (room.blackTimeMs ?? 0) - elapsed
        if (remaining <= 0) {
          tx.set(ref, {
            ...room,
            status: 'completed',
            result: 'white',
            endReason: 'timeout',
            blackTimeMs: 0,
            lastTickServerTs: null,
            updatedAt: now,
          } satisfies RoomDoc)
          throw new HttpsError('failed-precondition', 'Your time ran out.')
        }
        newBlackTimeMs = remaining + room.timeControl.incrementMs
      }
    }

    // Try the move.
    let applied
    try {
      applied = chess.move(parsed)
    } catch {
      applied = null
    }
    if (!applied) {
      throw new HttpsError('invalid-argument', 'Illegal move.')
    }
    const fenAfter = chess.fen()
    const newMove: Move = {
      san: applied.san,
      uci: `${applied.from}${applied.to}${applied.promotion ?? ''}`,
      fenBefore,
      fenAfter,
      byPlayerId: uid,
      clientTs: typeof clientTs === 'number' ? clientTs : now,
      serverTs: now,
    }

    // Detect game end.
    let status: RoomDoc['status'] = 'live'
    let result: RoomDoc['result'] | undefined
    let endReason: RoomDoc['endReason'] | undefined
    if (chess.isCheckmate()) {
      status = 'completed'
      // chess.js: side to move is the one who got mated.
      result = chess.turn() === 'w' ? 'black' : 'white'
      endReason = 'checkmate'
    } else if (chess.isStalemate()) {
      status = 'completed'
      result = 'draw'
      endReason = 'stalemate'
    } else if (chess.isInsufficientMaterial()) {
      status = 'completed'
      result = 'draw'
      endReason = 'insufficient_material'
    } else if (chess.isThreefoldRepetition()) {
      status = 'completed'
      result = 'draw'
      endReason = 'threefold_repetition'
    } else if (chess.isDraw()) {
      status = 'completed'
      result = 'draw'
      endReason = 'fifty_move'
    }

    const updated: RoomDoc = {
      ...room,
      moves: [...moves, newMove],
      currentFen: fenAfter,
      status,
      ...(result ? { result } : {}),
      ...(endReason ? { endReason } : {}),
      whiteTimeMs: newWhiteTimeMs,
      blackTimeMs: newBlackTimeMs,
      // If the game just ended, freeze the clock. Otherwise, restart it for
      // the new side to move.
      lastTickServerTs: room.timeControl && status === 'live' ? now : null,
      updatedAt: now,
    }
    tx.set(ref, updated)
    return { moveIndex, fenAfter }
  })

  return { ok: true, ...response }
})
