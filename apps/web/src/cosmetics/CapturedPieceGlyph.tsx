// Renders one captured-piece glyph using the equipped piece set.
// Player cards + CaptureSpark popups use this so all chess-piece icons
// stay visually consistent with the board pieces.

import { useCosmetics } from './useCosmetics'
import type { PieceSymbol } from '../chess/types'

export function CapturedPieceGlyph({ piece }: { piece: PieceSymbol }) {
  const { pieceSet } = useCosmetics()
  // Captured-piece colour comes from the parent CSS class
  // (puc-piece--w / --b); the Unicode glyph itself is colour-agnostic
  // so 'w' is just a stable input.
  return <>{pieceSet.glyphFor(piece, 'w')}</>
}
