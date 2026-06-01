// ChessGame: thin wrapper over chess.js.
//
// Purpose: keep chess.js as the single source of truth for legal moves while
// exposing a small, app-friendly API. The rest of the app should not import
// chess.js directly.

import { Chess } from 'chess.js'
import type {
  Color,
  GameStatus,
  MoveInput,
  MoveRecord,
  Piece,
  Square,
} from './types'

export class ChessGame {
  private chess: Chess
  private moves: MoveRecord[] = []

  constructor(fen?: string) {
    this.chess = new Chess(fen)
  }

  // --- State accessors ---

  fen(): string {
    return this.chess.fen()
  }

  pgn(): string {
    return this.chess.pgn()
  }

  turn(): Color {
    return this.chess.turn()
  }

  pieceAt(square: Square): Piece | null {
    const p = this.chess.get(square)
    return p ? { type: p.type, color: p.color } : null
  }

  history(): readonly MoveRecord[] {
    return this.moves
  }

  status(): GameStatus {
    if (this.chess.isCheckmate()) {
      // chess.js: side to move is the loser (they are mated).
      const winner: Color = this.chess.turn() === 'w' ? 'b' : 'w'
      return { kind: 'checkmate', winner }
    }
    if (this.chess.isStalemate()) {
      return { kind: 'stalemate' }
    }
    if (this.chess.isInsufficientMaterial()) {
      return { kind: 'draw', reason: 'insufficient_material' }
    }
    if (this.chess.isThreefoldRepetition()) {
      return { kind: 'draw', reason: 'threefold_repetition' }
    }
    if (this.chess.isDraw()) {
      // chess.js >=1.0 covers 50-move via isDraw(); use 'fifty_move' as a sane default
      // when none of the more specific reasons matched.
      return { kind: 'draw', reason: 'fifty_move' }
    }
    return { kind: 'in_progress', turn: this.chess.turn(), inCheck: this.chess.inCheck() }
  }

  // --- Move generation ---

  /** All legal moves from a square (for highlighting). */
  legalDestinationsFrom(square: Square): Square[] {
    const ms = this.chess.moves({ square, verbose: true })
    return ms.map((m) => m.to as Square)
  }

  /** All legal moves in the position (for engine analysis later). */
  allLegalMoves(): MoveRecord[] {
    const fenBefore = this.chess.fen()
    return this.chess.moves({ verbose: true }).map((m) => {
      // chess.js .moves({verbose}) does not mutate, so fenAfter is unknown
      // without an extra simulation. We leave it as fenBefore here; allLegalMoves
      // is only used for hints/UI, not for history.
      return {
        san: m.san,
        uci: `${m.from}${m.to}${m.promotion ?? ''}`,
        from: m.from as Square,
        to: m.to as Square,
        piece: m.piece,
        color: m.color,
        captured: m.captured,
        promotion: m.promotion,
        flags: m.flags,
        fenBefore,
        fenAfter: fenBefore,
      }
    })
  }

  // --- Mutations ---

  /**
   * Attempt a move. Returns the recorded move on success, or null if illegal.
   * Never throws on illegal input — callers always handle the null case.
   */
  move(input: MoveInput): MoveRecord | null {
    const fenBefore = this.chess.fen()
    let result
    try {
      result = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion })
    } catch {
      // chess.js v1 throws on illegal moves rather than returning null.
      return null
    }
    if (!result) return null
    const record: MoveRecord = {
      san: result.san,
      uci: `${result.from}${result.to}${result.promotion ?? ''}`,
      from: result.from as Square,
      to: result.to as Square,
      piece: result.piece,
      color: result.color,
      captured: result.captured,
      promotion: result.promotion,
      flags: result.flags,
      fenBefore,
      fenAfter: this.chess.fen(),
    }
    this.moves.push(record)
    return record
  }

  /** Undo the last move (used in local play / training only). */
  undo(): MoveRecord | null {
    const undone = this.chess.undo()
    if (!undone) return null
    return this.moves.pop() ?? null
  }
}
