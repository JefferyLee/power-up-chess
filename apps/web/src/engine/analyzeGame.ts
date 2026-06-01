// analyzeGame: walks a played game and produces per-move engine annotations.
//
// Calls the engine once per position (N+1 calls for an N-move game) by
// reusing each `evalAfter` as the next move's `evalBefore`. At depth 16 with
// stockfish-lite-single, expect ~1s per call → ~1 minute for a 60-move game.

import { Chess } from 'chess.js'
import { classifyMove, cpLossFromMover, type Classification } from './classify'
import type { StockfishEngine } from './stockfish'
import type { Color } from '../chess/types'

export interface AnalyzedMove {
  index: number
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  color: Color
  evalBeforeCp: number
  evalAfterCp: number
  bestMoveUci: string
  bestMoveSan: string | null
  classification: Classification
  cpLoss: number
  /** Engine's principal variation starting from fenAfter. Used by the
   *  Brilliant detector to check whether a sacrifice is immediately recovered. */
  pvAfter: string[]
  /** Whether the move passed the lightweight cp-loss tests; the full Brilliant
   *  check (sacrifice etc.) runs separately in brilliant.ts. */
  isBrilliantCandidate: boolean
}

export interface AnalyzedGame {
  startingFen: string
  initialEvalCp: number
  moves: AnalyzedMove[]
}

export interface AnalyzeGameOptions {
  /** Engine search depth per position. Lower = faster, less accurate. */
  depth?: number
  /** Called after each per-move analysis. */
  onProgress?: (done: number, total: number) => void
  /** Optional abort signal — analysis stops cleanly when aborted. */
  signal?: AbortSignal
}

/**
 * Walks `pgn`, calling `engine.analyze` once per position. Returns a structured
 * record of every move with eval, best move, classification, and cp loss.
 */
export async function analyzeGame(
  pgn: string,
  engine: StockfishEngine,
  options: AnalyzeGameOptions = {},
): Promise<AnalyzedGame> {
  const depth = options.depth ?? 16

  const chess = new Chess()
  if (pgn.trim().length > 0) chess.loadPgn(pgn)
  const history = chess.history({ verbose: true })

  // Replay from the start so we have a fresh cursor; record each move's fenBefore.
  const cursor = new Chess()
  const startingFen = cursor.fen()

  // total = history.length engine calls for the FEN-after of each move, plus 1
  // for the very first FEN-before (the starting position).
  const total = history.length + 1
  let done = 0
  const tick = () => {
    done += 1
    options.onProgress?.(done, total)
  }

  if (options.signal?.aborted) throw new Error('Aborted')

  // First analysis: the starting position. Gives us evalBefore + bestMove for move 0.
  const initial = await engine.analyze(startingFen, depth)
  tick()
  let prevEvalCp = initial.evalCp
  let prevBestUci = initial.bestMoveUci

  const moves: AnalyzedMove[] = []

  for (let i = 0; i < history.length; i++) {
    if (options.signal?.aborted) throw new Error('Aborted')

    const m = history[i]!
    const fenBefore = cursor.fen()
    const applied = cursor.move({
      from: m.from,
      to: m.to,
      ...(m.promotion ? { promotion: m.promotion } : {}),
    })
    if (!applied) {
      throw new Error(`Could not replay move ${i + 1}: ${m.san}`)
    }
    const fenAfter = cursor.fen()

    // Analyse the resulting position to get the next eval (and the engine's
    // best response, which becomes the *next* move's bestMoveUci comparison).
    const after = await engine.analyze(fenAfter, depth)
    tick()

    const color: Color = m.color
    const uci = `${m.from}${m.to}${m.promotion ?? ''}`
    const isBestMove = !!prevBestUci && prevBestUci === uci

    // Compute best-move SAN by trying it on a clone of the pre-move position.
    let bestMoveSan: string | null = null
    if (prevBestUci) {
      const probe = new Chess(fenBefore)
      try {
        const r = probe.move({
          from: prevBestUci.slice(0, 2),
          to: prevBestUci.slice(2, 4),
          ...(prevBestUci.length === 5 ? { promotion: prevBestUci[4] } : {}),
        })
        bestMoveSan = r ? r.san : null
      } catch {
        bestMoveSan = null
      }
    }

    const classification = classifyMove({
      evalBeforeWhite: prevEvalCp,
      evalAfterWhite: after.evalCp,
      sideToMove: color,
      isBestMove,
    })
    const cpLoss = cpLossFromMover({
      evalBeforeWhite: prevEvalCp,
      evalAfterWhite: after.evalCp,
      sideToMove: color,
      isBestMove,
    })

    moves.push({
      index: i,
      san: m.san,
      uci,
      fenBefore,
      fenAfter,
      color,
      evalBeforeCp: prevEvalCp,
      evalAfterCp: after.evalCp,
      bestMoveUci: prevBestUci,
      bestMoveSan,
      classification,
      cpLoss,
      pvAfter: after.pv,
      // Light pre-filter for the Brilliant detector — only "best or near-best"
      // moves are even worth running the full heuristic on.
      isBrilliantCandidate: classification === 'best' || classification === 'excellent',
    })

    prevEvalCp = after.evalCp
    prevBestUci = after.bestMoveUci
  }

  return {
    startingFen,
    initialEvalCp: initial.evalCp,
    moves,
  }
}
