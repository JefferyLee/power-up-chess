// Piece-set registry — the inventory the Theme Shop draws from.
//
// MVP3 P1.D current state (Slice 3):
//   classic   free, Unicode solid    — default
//   outline   free, Unicode hollow
//   cburnett  common (200 pts), SVG  — vendored lichess set
//   fantasy   rare   (500 pts), SVG  — vendored lichess "fantasy" set
//   animated  master (1000 pts), SVG + CSS glow on top of cburnett
//   stone     master (1000 pts), PNG — AI-generated stone sculptures
//             served from /public/sprites/stone/ (not bundled)
//
// glyphFor returns ReactNode so SVG sets can render an <img>; Unicode
// sets return a string. Server-side prices live in
// functions/src/cosmetics/registry.ts and MUST stay in sync.

import type { ReactNode } from 'react'
import type { Color, PieceSymbol } from '../chess/types'
import { PIECE_GLYPH_HOLLOW, PIECE_GLYPH_SOLID } from '../board/pieceGlyphs'

// Cburnett SVGs — vendored at apps/web/src/cosmetics/assets/cburnett/
// (see LICENSE.md in that folder). Vite resolves these to URLs.
import cburnettWK from './assets/cburnett/wK.svg'
import cburnettWQ from './assets/cburnett/wQ.svg'
import cburnettWR from './assets/cburnett/wR.svg'
import cburnettWB from './assets/cburnett/wB.svg'
import cburnettWN from './assets/cburnett/wN.svg'
import cburnettWP from './assets/cburnett/wP.svg'
import cburnettBK from './assets/cburnett/bK.svg'
import cburnettBQ from './assets/cburnett/bQ.svg'
import cburnettBR from './assets/cburnett/bR.svg'
import cburnettBB from './assets/cburnett/bB.svg'
import cburnettBN from './assets/cburnett/bN.svg'
import cburnettBP from './assets/cburnett/bP.svg'

const CBURNETT: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: cburnettWK, q: cburnettWQ, r: cburnettWR, b: cburnettWB, n: cburnettWN, p: cburnettWP },
  b: { k: cburnettBK, q: cburnettBQ, r: cburnettBR, b: cburnettBB, n: cburnettBN, p: cburnettBP },
}

// Fantasy SVGs — vendored at apps/web/src/cosmetics/assets/fantasy/
import fantasyWK from './assets/fantasy/wK.svg'
import fantasyWQ from './assets/fantasy/wQ.svg'
import fantasyWR from './assets/fantasy/wR.svg'
import fantasyWB from './assets/fantasy/wB.svg'
import fantasyWN from './assets/fantasy/wN.svg'
import fantasyWP from './assets/fantasy/wP.svg'
import fantasyBK from './assets/fantasy/bK.svg'
import fantasyBQ from './assets/fantasy/bQ.svg'
import fantasyBR from './assets/fantasy/bR.svg'
import fantasyBB from './assets/fantasy/bB.svg'
import fantasyBN from './assets/fantasy/bN.svg'
import fantasyBP from './assets/fantasy/bP.svg'

const FANTASY: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: fantasyWK, q: fantasyWQ, r: fantasyWR, b: fantasyWB, n: fantasyWN, p: fantasyWP },
  b: { k: fantasyBK, q: fantasyBQ, r: fantasyBR, b: fantasyBB, n: fantasyBN, p: fantasyBP },
}

// Stone sculpture PNGs — AI-generated, hosted at /public/sprites/stone/.
// Kept out of the bundle (460 KB combined) since they're loaded lazily by
// the chess board only when this set is equipped.
const STONE: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: '/sprites/stone/wK.png', q: '/sprites/stone/wQ.png', r: '/sprites/stone/wR.png',
    b: '/sprites/stone/wB.png', n: '/sprites/stone/wN.png', p: '/sprites/stone/wP.png',
  },
  b: {
    k: '/sprites/stone/bK.png', q: '/sprites/stone/bQ.png', r: '/sprites/stone/bR.png',
    b: '/sprites/stone/bB.png', n: '/sprites/stone/bN.png', p: '/sprites/stone/bP.png',
  },
}

export type PieceSetTier = 'free' | 'common' | 'rare' | 'master'
export type PieceSetId =
  | 'classic'
  | 'outline'
  | 'cburnett'
  | 'fantasy'
  | 'animated'
  | 'stone'

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
  /** Returns a renderable for one piece. Unicode sets return a string
   *  (rendered via CSS colour on the parent `.puc-piece--w/b`); SVG sets
   *  return an `<img>` element so the artwork carries its own colour. */
  glyphFor: (type: PieceSymbol, color: Color) => ReactNode
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
    locked: false,
    glyphFor: (t, c) => (
      <img
        src={CBURNETT[c][t]}
        alt=""
        draggable={false}
        className="puc-piece-svg"
      />
    ),
  },
  fantasy: {
    id: 'fantasy',
    label: 'Fantasy Quest',
    blurb: 'Sword on the bishop, dragon on the knight — Ada’s pick.',
    tier: 'rare',
    priceCp: 500,
    locked: false,
    glyphFor: (t, c) => (
      <img
        src={FANTASY[c][t]}
        alt=""
        draggable={false}
        className="puc-piece-svg"
      />
    ),
  },
  animated: {
    id: 'animated',
    label: 'Glowing Crystal',
    blurb: 'A magical pulse around every piece — master-tier showpiece.',
    tier: 'master',
    priceCp: 1000,
    locked: false,
    // Uses the same cburnett artwork wrapped with an extra class so
    // CSS keyframes can apply the master-tier glow without needing
    // a separate SVG asset family.
    glyphFor: (t, c) => (
      <img
        src={CBURNETT[c][t]}
        alt=""
        draggable={false}
        className="puc-piece-svg puc-piece-svg--animated"
      />
    ),
  },
  stone: {
    id: 'stone',
    label: 'Carved Stone',
    blurb: 'Marble and obsidian sculptures — like the Wizard\'s Chess pieces in the great hall.',
    tier: 'master',
    priceCp: 1000,
    locked: false,
    glyphFor: (t, c) => (
      <img
        src={STONE[c][t]}
        alt=""
        draggable={false}
        className="puc-piece-svg"
      />
    ),
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
  'stone',
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
