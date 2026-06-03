import { describe, expect, it } from 'vitest'
import type { AnalyzedMove } from './analyzeGame'
import { isBrilliant, totalMaterial } from './brilliant'

function move(overrides: Partial<AnalyzedMove>): AnalyzedMove {
  return {
    index: 20,
    san: '?',
    uci: 'e2e4',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    color: 'w',
    evalBeforeCp: 0,
    evalAfterCp: 0,
    bestMoveUci: '',
    bestMoveSan: null,
    classification: 'best',
    cpLoss: 0,
    pvAfter: [],
    isBrilliantCandidate: true,
    ...overrides,
  }
}

describe('totalMaterial', () => {
  it('counts the starting position as 78 (39 + 39)', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    expect(totalMaterial(startFen)).toBe(78)
  })

  it('counts an endgame position correctly', () => {
    // K+R vs K+P endgame: 5 + 1 = 6
    expect(totalMaterial('4k3/8/8/8/4P3/8/8/4K2R w K - 0 1')).toBe(6)
  })
})

describe('isBrilliant', () => {
  it('rejects when cp loss > 30', () => {
    expect(
      isBrilliant(move({ cpLoss: 80 })).brilliant,
    ).toBe(false)
  })

  it('rejects when position was already overwhelming (eval > 500)', () => {
    expect(
      isBrilliant(move({ evalBeforeCp: 700, cpLoss: 0 })).brilliant,
    ).toBe(false)
  })

  it('rejects an opening move (index < 10)', () => {
    expect(
      isBrilliant(move({ index: 2, cpLoss: 0 })).brilliant,
    ).toBe(false)
  })

  it('rejects an endgame position with low material', () => {
    // K+P vs K+P: total 2. Below 20 threshold → reject.
    const fen = '4k3/4p3/8/8/8/8/4P3/4K3 w - - 0 30'
    expect(
      isBrilliant(move({ fenBefore: fen, fenAfter: fen, cpLoss: 0 })).brilliant,
    ).toBe(false)
  })

  it('classic queen sacrifice in middlegame, not recaptured: brilliant', () => {
    // Construct a clean test: white plays Qxh7+ where the queen lands on h7
    // attacked by black's king, but black's best response (per engine PV) is
    // NOT taking the queen because mate follows.
    //
    // Setup: position where Qh5xh7+ is brilliant; black's king must move (PV
    // does not capture the queen).
    // For test purposes we just feed the AnalyzedMove with the relevant fields.
    const moveData = move({
      index: 22,
      uci: 'h5h7', // queen to h7, captured by... see below
      fenBefore: 'rnbq1rk1/pppppppp/8/7Q/8/8/PPPPPPPP/RNB1KBNR w KQ - 0 12',
      // After the move: queen on h7 attacked by king. Black to move.
      fenAfter: 'rnbq1rk1/pppppppQ/8/8/8/8/PPPPPPPP/RNB1KBNR b KQ - 0 12',
      color: 'w',
      evalBeforeCp: 50,
      evalAfterCp: 30, // slight loss, well within −50 threshold for white
      cpLoss: 20,
      // Engine says black's best response is a king flight, not the recapture:
      pvAfter: ['g8f7', 'h7h8', 'f7e6'],
    })
    const r = isBrilliant(moveData)
    expect(r.reasons.cpLossOk).toBe(true)
    expect(r.reasons.sacrificed).toBe(true)
    expect(r.reasons.notRecovered).toBe(true)
    expect(r.reasons.evalPreserved).toBe(true)
    expect(r.reasons.notAlreadyWinning).toBe(true)
    expect(r.reasons.nonTrivialPosition).toBe(true)
    expect(r.brilliant).toBe(true)
  })

  it('does not crash on rank-1 destination (regression: chess.js BigInt mix)', () => {
    // Pre-fix, listDefenders probed defenders by remove(destSquare) +
    // put({type:'p',color:opp}, destSquare) + moves({verbose:true}). When
    // destSquare was on rank 1 (or rank 8), the put placed a pawn on a rank
    // pawns can't legally occupy. chess.js v1.4.0's _movePiece tries to
    // maintain a Zobrist BigInt hash and crashes during legal-move
    // enumeration with:
    //   "Cannot mix BigInt and other types, use explicit conversions"
    // Symptom: clicking Review on any saved game crashed during the
    // analyzeGame post-pass that runs isBrilliant() on every candidate move.
    // The fix replaces remove+put+moves with chess.attackers() — geometric,
    // no board mutation, no hash maintenance.
    //
    // The trigger needs (a) STM has many pieces (deepens move-gen recursion)
    // and (b) destSquare on rank 1 with at least one attacker. Italian/Ruy
    // positions after castling are the smallest reliable trigger.
    const moveData = move({
      index: 22,
      uci: 'h1e1', // white rook to e1, attacked by black rook on a1
      fenBefore: '4k3/8/8/8/8/7K/PPPPPPPP/r6R w - - 0 20',
      fenAfter: '4k3/8/8/8/8/7K/PPPPPPPP/r3R3 b - - 1 20',
      color: 'w',
      cpLoss: 0,
      pvAfter: [],
    })
    expect(() => isBrilliant(moveData)).not.toThrow()
  })

  it('queen sacrifice that IS recaptured next move: not brilliant', () => {
    const moveData = move({
      index: 22,
      uci: 'h5h7',
      fenBefore: 'rnbq1rk1/pppppppp/8/7Q/8/8/PPPPPPPP/RNB1KBNR w KQ - 0 12',
      fenAfter: 'rnbq1rk1/pppppppQ/8/8/8/8/PPPPPPPP/RNB1KBNR b KQ - 0 12',
      color: 'w',
      evalBeforeCp: 50,
      evalAfterCp: -200,
      cpLoss: 250,
      // Engine PV: opponent captures the queen on h7.
      pvAfter: ['g8h7'],
    })
    const r = isBrilliant(moveData)
    expect(r.brilliant).toBe(false)
    expect(r.reasons.notRecovered).toBe(false)
  })
})
