import type { PieceSymbol } from '../chess/types'

/** Standard piece point values used in capture cards. The king is never captured. */
export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}
