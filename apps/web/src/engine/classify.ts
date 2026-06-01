// Move classification.
//
// Lichess-style centipawn-loss thresholds (locked for MVP0 — see
// docs/TECHNICAL_ARCHITECTURE.md). Brilliant detection is layered on top in
// brilliant.ts; this module only handles the cp-loss buckets.

import type { Color } from '../chess/types'

export type Classification =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'

export interface ClassifyInput {
  /** White-POV eval before the move, in centipawns. */
  evalBeforeWhite: number
  /** White-POV eval after the move, in centipawns. */
  evalAfterWhite: number
  /** The side that just moved. */
  sideToMove: Color
  /** Was the played move identical to the engine's best move? */
  isBestMove: boolean
}

/** Centipawn loss from the moving side's perspective. Clamped to ≥ 0:
 *  if the position actually got better (engine search noise at low depth),
 *  there's no "loss" to penalise. */
export function cpLossFromMover(input: ClassifyInput): number {
  const { evalBeforeWhite, evalAfterWhite, sideToMove } = input
  const raw =
    sideToMove === 'w'
      ? evalBeforeWhite - evalAfterWhite
      : evalAfterWhite - evalBeforeWhite
  return Math.max(0, raw)
}

export function classifyMove(input: ClassifyInput): Classification {
  if (input.isBestMove) return 'best'
  const loss = cpLossFromMover(input)
  if (loss <= 10) return 'excellent'
  if (loss <= 50) return 'good'
  if (loss <= 100) return 'inaccuracy'
  if (loss <= 200) return 'mistake'
  return 'blunder'
}
