// Unicode chess glyphs. Two maps are exported:
//
//   PIECE_GLYPH_SOLID  — the default "Classic" set; CSS paints fill+stroke
//                        for both colours, so we always use the solid forms.
//   PIECE_GLYPH_HOLLOW — the "Outline" cosmetic set (P1.D Theme Shop).
//
// U+FE0E (text variation selector) appended to every glyph forces text
// presentation instead of emoji. Without it, U+265F (BLACK CHESS PAWN) is
// rendered as a colour emoji by macOS/iOS — always black — and ignores
// the CSS `color` applied for white pieces.

import type { PieceSymbol } from '../chess/types'

const TEXT = '︎'

export const PIECE_GLYPH_SOLID: Record<PieceSymbol, string> = {
  k: `♚${TEXT}`,
  q: `♛${TEXT}`,
  r: `♜${TEXT}`,
  b: `♝${TEXT}`,
  n: `♞${TEXT}`,
  p: `♟${TEXT}`,
}

export const PIECE_GLYPH_HOLLOW: Record<PieceSymbol, string> = {
  k: `♔${TEXT}`,
  q: `♕${TEXT}`,
  r: `♖${TEXT}`,
  b: `♗${TEXT}`,
  n: `♘${TEXT}`,
  p: `♙${TEXT}`,
}
