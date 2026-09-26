// Shared glyphs + ordering for the six white pieces in the shop and panel.
import type { Modifier, SpellId, TowerType } from '../sim/types'

export const TOWER_ORDER: readonly TowerType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

export const PIECE_GLYPH: Record<TowerType, string> = {
  pawn: '♙',
  knight: '♘',
  bishop: '♗',
  rook: '♖',
  queen: '♕',
  king: '♔',
}

export const SPELL_GLYPH: Record<SpellId, string> = {
  fork: '⑂',
  pin: '⊕',
  skewer: '⟿',
  castling: '⇄',
}

/** Why a piece can't be bought right now, from the map's modifier rules
 *  (docs/SIEGE_DESIGN.md §6) and the board — or null when it's fine.
 *  `sim.canBuild` needs a cell; the shop has none yet, so it mirrors
 *  the per-piece rules here and leaves the per-cell ones to the ghost. */
export function shopBlockReason(
  type: TowerType,
  cost: number,
  gold: number,
  modifiers: ReadonlyArray<Modifier>,
  towerCount: number,
  hasKing: boolean,
): string | null {
  if (type === 'queen' && modifiers.includes('noQueens')) return 'No queens on this map.'
  if (type === 'king' && modifiers.includes('noKing')) return 'No king on this map.'
  if (type === 'king' && hasKing) return 'One king per board — he is already out there.'
  if (modifiers.includes('maxTowers8') && towerCount >= 8) return 'Eight pieces at most on this map.'
  if (gold < cost) return `Needs ${cost} gold — you have ${gold}.`
  return null
}
