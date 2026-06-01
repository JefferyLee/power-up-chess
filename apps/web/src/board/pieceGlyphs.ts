// Unicode chess glyphs. Using the solid set (♚♛♜♝♞♟) for both colours so we
// can paint colour and outline via CSS instead of fighting the outline vs solid
// pair of glyphs. Future themes can swap these for SVG piece sets.

import type { PieceSymbol } from '../chess/types'

export const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
}
