// Brilliant move detector.
//
// Six-condition heuristic from docs/TECHNICAL_ARCHITECTURE.md, all must hold:
//   1. cp loss ≤ 30 (best or near-best engine move)
//   2. The move sacrifices material — moving piece lands on a square attacked
//      by an opponent piece of equal or lower value (no defender of equal
//      value), OR the move captures a smaller piece while leaving a larger one
//      hanging.
//   3. The sacrifice is not immediately recovered — opponent's best response
//      (PV[0] of fenAfter) does NOT recapture the sacrificed piece on the
//      destination square.
//   4. eval(fenAfter) ≥ eval(fenBefore) − 50 cp from the moving side's POV.
//   5. eval(fenBefore) is not already overwhelming (|eval| < 500 cp).
//   6. Non-trivial position: ≥10 plies into the game, total material ≥ 20.

import { Chess } from 'chess.js'
import type { AnalyzedMove } from './analyzeGame'
import type { Color, PieceSymbol } from '../chess/types'

const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
}

export interface BrilliantCheck {
  brilliant: boolean
  /** Diagnostic info — which of the 6 conditions passed. Useful for debugging
   *  and for surfacing in the dev tools later. */
  reasons: {
    cpLossOk: boolean
    sacrificed: boolean
    notRecovered: boolean
    evalPreserved: boolean
    notAlreadyWinning: boolean
    nonTrivialPosition: boolean
  }
}

export function isBrilliant(m: AnalyzedMove): BrilliantCheck {
  const reasons = {
    cpLossOk: m.cpLoss <= 30,
    sacrificed: detectSacrifice(m),
    notRecovered: !isRecoveryMove(m),
    evalPreserved: evalPreservedFromMover(m) >= -50,
    notAlreadyWinning: Math.abs(m.evalBeforeCp) < 500,
    nonTrivialPosition: m.index >= 10 && totalMaterial(m.fenBefore) >= 20,
  }
  const brilliant = Object.values(reasons).every(Boolean)
  return { brilliant, reasons }
}

/** eval delta for the side that just moved, in cp. Positive = improved. */
function evalPreservedFromMover(m: AnalyzedMove): number {
  return m.color === 'w' ? m.evalAfterCp - m.evalBeforeCp : m.evalBeforeCp - m.evalAfterCp
}

/** True if the moving piece lands on a square where, after a fair exchange,
 *  the moving side loses material. We approximate Static Exchange Evaluation
 *  with: piece is attacked AND not sufficiently defended.
 *
 *  Covers the common middlegame sacrifices:
 *  - Greek gift (queen to h7 attacked by king, undefended) → sacrifice.
 *  - Knight thrown into a pawn's territory without support → sacrifice.
 *
 *  Misses: defended sacrifices with deeper compensation (e.g. positional
 *  exchange sacs supported by long-range pieces). False negatives are fine —
 *  the Brilliant label is precision-over-recall by design. */
function detectSacrifice(m: AnalyzedMove): boolean {
  const chess = new Chess(m.fenAfter)
  const destSquare = m.uci.slice(2, 4)
  const movedPiece = chess.get(destSquare as Parameters<typeof chess.get>[0])
  if (!movedPiece) return false
  const movedValue = PIECE_VALUE[movedPiece.type as PieceSymbol]

  // Opponent's attackers of destSquare.
  const attackerValues = listAttackers(m.fenAfter, destSquare, opposite(m.color))
  if (attackerValues.length === 0) return false

  // Our defenders of destSquare (excluding the moving piece itself).
  const defenderValues = listDefenders(m.fenAfter, destSquare, m.color)

  const lowestAttacker = Math.min(...attackerValues)
  // Case 1: nothing defends → piece just hangs.
  if (defenderValues.length === 0) return true
  const lowestDefender = Math.min(...defenderValues)
  // Case 2: defender exists but is more valuable than the cheapest attacker —
  // opponent grabs with the cheap attacker, we re-take with the dear defender.
  // Net: we lose movedValue, they lose lowestAttacker. Sacrifice if we end up
  // down material.
  return movedValue > lowestAttacker && lowestDefender > lowestAttacker
}

/** Piece values of attackers (opponent pieces that can move to `square` next). */
function listAttackers(fen: string, square: string, attackerColor: Color): number[] {
  const probe = withSideToMove(fen, attackerColor)
  return probe
    .moves({ verbose: true })
    .filter((mv) => mv.to === square && mv.captured)
    .map((mv) => PIECE_VALUE[mv.piece as PieceSymbol])
}

/** Piece values of defenders (own pieces that would recapture on `square`).
 *  We probe by replacing the square's contents with an opponent piece and
 *  asking which of our pieces could capture it. */
function listDefenders(fen: string, square: string, defenderColor: Color): number[] {
  const probe = withSideToMove(fen, defenderColor)
  probe.remove(square as Parameters<typeof probe.remove>[0])
  probe.put({ type: 'p', color: opposite(defenderColor) }, square as Parameters<typeof probe.put>[1])
  return probe
    .moves({ verbose: true })
    .filter((mv) => mv.to === square && mv.captured)
    .map((mv) => PIECE_VALUE[mv.piece as PieceSymbol])
}

/** True if the engine's predicted opponent response captures our piece on the
 *  destination square — i.e. the sacrifice was a routine trade, not brilliant. */
function isRecoveryMove(m: AnalyzedMove): boolean {
  if (m.pvAfter.length === 0) return false
  const destSquare = m.uci.slice(2, 4)
  const opponentReply = m.pvAfter[0]!
  return opponentReply.slice(2, 4) === destSquare
}

function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w'
}

/** Returns a chess.js Chess instance for `fen` but with side-to-move forced
 *  to `side` (so we can ask for the opponent's pseudo-legal moves). */
function withSideToMove(fen: string, side: Color): Chess {
  const parts = fen.split(' ')
  parts[1] = side
  // Clear en-passant + counters to keep the position legal-enough for
  // pseudo-legal move generation.
  parts[3] = '-'
  return new Chess(parts.join(' '))
}

/** Sum of piece values on the board (both colors combined, excluding kings). */
export function totalMaterial(fen: string): number {
  const placement = fen.split(' ')[0]
  if (!placement) return 0
  let total = 0
  for (const ch of placement) {
    const lower = ch.toLowerCase()
    if (lower === 'p') total += 1
    else if (lower === 'n' || lower === 'b') total += 3
    else if (lower === 'r') total += 5
    else if (lower === 'q') total += 9
    // king and digits/slashes ignored
  }
  return total
}
