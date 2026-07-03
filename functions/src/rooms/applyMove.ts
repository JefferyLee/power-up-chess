// Pure move-validation core of submitMove, extracted so it can be unit-tested
// without Firestore (AUDIT_AND_PLAN Phase 0.2). Given the current room doc and
// the submitted move, decide the outcome:
//
//   ok       — move is legal: here's the updated room doc to commit.
//   flagged  — the mover's clock ran out before this move: here's the room doc
//              marked completed-by-timeout to commit; the move is rejected.
//   reject   — nothing to write; map `code` to an HttpsError at the boundary.
//
// The wrapper (submitMove.ts) owns the transaction, the write, and the error
// mapping. NOTE: returning `flagged` as data (instead of writing + throwing
// inside the transaction, as the pre-extraction code did) also fixes a real
// bug — a throw inside runTransaction aborts the transaction, so the old
// timeout write never actually committed and the room stayed live.

import { Chess } from 'chess.js'
import type { ParsedUci } from './parseUci'
import type { Move, RoomDoc } from './types'

export type RejectCode =
  | 'not-live'
  | 'no-black'
  | 'out-of-sync'
  | 'corrupt-history'
  | 'not-your-turn'
  | 'illegal'

export type ApplyMoveOutcome =
  | { kind: 'ok'; updated: RoomDoc; fenAfter: string }
  | { kind: 'flagged'; updated: RoomDoc }
  | { kind: 'reject'; code: RejectCode; message: string }

export interface ApplyMoveInput {
  moveIndex: number
  parsed: ParsedUci
  uid: string
  clientTs?: number
  now: number
}

export function applyMove(room: RoomDoc, input: ApplyMoveInput): ApplyMoveOutcome {
  const { moveIndex, parsed, uid, clientTs, now } = input

  if (room.status !== 'live') {
    return { kind: 'reject', code: 'not-live', message: 'Room is not live.' }
  }
  if (!room.black) {
    return { kind: 'reject', code: 'no-black', message: 'Room has no black player yet.' }
  }
  const moves = room.moves ?? []
  if (moveIndex !== moves.length) {
    // Lost-update race: client tried to submit move N when N already exists.
    return { kind: 'reject', code: 'out-of-sync', message: `Move index out of sync (expected ${moves.length}).` }
  }

  // Replay the existing move list to reach the current position.
  const chess = new Chess()
  for (const m of moves) {
    let replay
    try {
      replay = chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
    } catch {
      replay = null
    }
    if (!replay) {
      // Should never happen — would mean stored history is corrupted.
      return { kind: 'reject', code: 'corrupt-history', message: 'Stored move history is invalid.' }
    }
  }
  const fenBefore = chess.fen()

  // Whose turn is it? Match to the caller's color.
  const turn = chess.turn() // 'w' | 'b'
  const expectedUid = turn === 'w' ? room.white.playerId : room.black.playerId
  if (uid !== expectedUid) {
    return { kind: 'reject', code: 'not-your-turn', message: 'It is not your turn.' }
  }

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
        return {
          kind: 'flagged',
          updated: {
            ...room,
            status: 'completed',
            result: 'black',
            endReason: 'timeout',
            whiteTimeMs: 0,
            lastTickServerTs: null,
            updatedAt: now,
          },
        }
      }
      newWhiteTimeMs = remaining + room.timeControl.incrementMs
    } else {
      const remaining = (room.blackTimeMs ?? 0) - elapsed
      if (remaining <= 0) {
        return {
          kind: 'flagged',
          updated: {
            ...room,
            status: 'completed',
            result: 'white',
            endReason: 'timeout',
            blackTimeMs: 0,
            lastTickServerTs: null,
            updatedAt: now,
          },
        }
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
    return { kind: 'reject', code: 'illegal', message: 'Illegal move.' }
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
  return { kind: 'ok', updated, fenAfter }
}
