// Renders one captured-piece glyph using the equipped piece set.
// Player cards + CaptureSpark popups use this so all chess-piece icons
// stay visually consistent with the board pieces.

import { useCosmetics } from './useCosmetics'
import type { Color, PieceSymbol } from '../chess/types'

export function CapturedPieceGlyph({
  piece,
  color,
}: {
  piece: PieceSymbol
  color: Color
}) {
  const { pieceSet } = useCosmetics()
  // For Unicode sets the visible colour comes from the parent CSS class
  // (.puc-piece--w/--b). For SVG sets the colour lives in the artwork
  // itself, so glyphFor needs to pick the right file.
  return <>{pieceSet.glyphFor(piece, color)}</>
}
