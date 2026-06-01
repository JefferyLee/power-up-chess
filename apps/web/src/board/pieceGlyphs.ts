// Unicode chess glyphs. Using the solid set (♚♛♜♝♞♟) for both colours so we
// can paint colour and outline via CSS instead of fighting the outline vs solid
// pair of glyphs. Future themes can swap these for SVG piece sets.
//
// U+FE0E (text variation selector) appended to every glyph forces text
// presentation instead of emoji. Without it, U+265F (BLACK CHESS PAWN) is
// rendered as a colour emoji by macOS/iOS — always black — and ignores the
// CSS `color` applied for white pieces.

import type { PieceSymbol } from '../chess/types'

const TEXT = '︎'

export const PIECE_GLYPH: Record<PieceSymbol, string> = {
  k: `♚${TEXT}`,
  q: `♛${TEXT}`,
  r: `♜${TEXT}`,
  b: `♝${TEXT}`,
  n: `♞${TEXT}`,
  p: `♟${TEXT}`,
}
