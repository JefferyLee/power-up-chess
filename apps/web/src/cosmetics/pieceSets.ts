// Piece-set registry — the inventory the Theme Shop draws from.
//
// MVP3 P1.D Slice 1: two Unicode-based starter sets that ship today as
// free, plus three placeholder cards (Common / Rare / Master tiers)
// shown as "Coming soon" in the shop so the pricing structure is
// visible. Slice 2 will plug real SVG sets + a server-side purchase
// callable in.
//
// The glyphFor function returns a string today because all live sets
// are Unicode-based; SVG sets will need a richer shape (React node or
// component reference) when we add them.

import type { Color, PieceSymbol } from '../chess/types'
import { PIECE_GLYPH_HOLLOW, PIECE_GLYPH_SOLID } from '../board/pieceGlyphs'

export type PieceSetTier = 'free' | 'common' | 'rare' | 'master'
export type PieceSetId =
  | 'classic'
  | 'outline'
  | 'cburnett'
  | 'fantasy'
  | 'animated'

export interface PieceSet {
  id: PieceSetId
  label: string
  blurb: string
  tier: PieceSetTier
  /** Castle-point cost. 0 for free sets. */
  priceCp: number
  /** True until the set has real assets in place. The shop renders
   *  locked cards with the price visible but no Equip action. */
  locked: boolean
  glyphFor: (type: PieceSymbol, color: Color) => string
}

export const PIECE_SETS: Record<PieceSetId, PieceSet> = {
  classic: {
    id: 'classic',
    label: 'Classic',
    blurb: 'Solid silhouettes — the default castle set.',
    tier: 'free',
    priceCp: 0,
    locked: false,
    glyphFor: (t) => PIECE_GLYPH_SOLID[t],
  },
  outline: {
    id: 'outline',
    label: 'Outline',
    blurb: 'Light, hollow pieces — easier to spot the square behind them.',
    tier: 'free',
    priceCp: 0,
    locked: false,
    glyphFor: (t) => PIECE_GLYPH_HOLLOW[t],
  },
  cburnett: {
    id: 'cburnett',
    label: 'Cburnett',
    blurb: 'The lichess classic — crisp SVG silhouettes.',
    tier: 'common',
    priceCp: 200,
    locked: true,
    glyphFor: (t) => PIECE_GLYPH_SOLID[t],
  },
  fantasy: {
    id: 'fantasy',
    label: 'Fantasy Quest',
    blurb: 'Sword on the bishop, dragon on the knight — Ada’s pick.',
    tier: 'rare',
    priceCp: 500,
    locked: true,
    glyphFor: (t) => PIECE_GLYPH_SOLID[t],
  },
  animated: {
    id: 'animated',
    label: 'Glowing Crystal',
    blurb: 'Subtle pulse on every piece — master tier showpiece.',
    tier: 'master',
    priceCp: 1000,
    locked: true,
    glyphFor: (t) => PIECE_GLYPH_SOLID[t],
  },
}

export const DEFAULT_PIECE_SET_ID: PieceSetId = 'classic'

/** The order Shop cards appear in. Drives both layout and the equip
 *  carousel. */
export const PIECE_SET_ORDER: PieceSetId[] = [
  'classic',
  'outline',
  'cburnett',
  'fantasy',
  'animated',
]

export function getPieceSet(id: string | undefined): PieceSet {
  if (id && id in PIECE_SETS) return PIECE_SETS[id as PieceSetId]
  return PIECE_SETS[DEFAULT_PIECE_SET_ID]
}

export function isPieceSetId(s: string | undefined): s is PieceSetId {
  return !!s && s in PIECE_SETS
}

export const PIECE_SET_TIER_LABEL: Record<PieceSetTier, string> = {
  free: 'Free',
  common: 'Common',
  rare: 'Rare',
  master: 'Master',
}
