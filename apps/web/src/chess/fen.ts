// FEN parsing helper. We only need the piece-placement section to render the board.

import type { Color, Piece, PieceSymbol, Square } from './types'

const PIECE_CHARS = new Set(['p', 'n', 'b', 'r', 'q', 'k'])

export function piecesFromFen(fen: string): Partial<Record<Square, Piece>> {
  const placement = fen.split(' ')[0]
  if (!placement) return {}
  const out: Partial<Record<Square, Piece>> = {}
  const ranks = placement.split('/')
  // ranks[0] is rank 8 in FEN.
  for (let r = 0; r < 8; r++) {
    const row = ranks[r]
    if (!row) continue
    let file = 0
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch)
        continue
      }
      const lower = ch.toLowerCase() as PieceSymbol
      if (!PIECE_CHARS.has(lower)) continue
      const color: Color = ch === ch.toUpperCase() ? 'w' : 'b'
      const square = `${String.fromCharCode(97 + file)}${8 - r}` as Square
      out[square] = { type: lower, color }
      file += 1
    }
  }
  return out
}

/** Locate the king of the given colour in the position. Used for check-highlight. */
export function findKing(pieces: Partial<Record<Square, Piece>>, color: Color): Square | null {
  for (const [sq, piece] of Object.entries(pieces) as Array<[Square, Piece]>) {
    if (piece.type === 'k' && piece.color === color) return sq
  }
  return null
}
