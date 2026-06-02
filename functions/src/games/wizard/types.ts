// Wizard's Duel types — local to the variant.

import type { Color, Square } from '../../shared/chessTypes'

export type EffectKind = 'freeze' | 'confuse' | 'shield' | 'phantom'

export interface Effect {
  kind: EffectKind
  /** The piece's owner. Used to render effect badges in the right colour
   *  and to gate when the effect "applies" in move generation. */
  affectedColor: Color
  /** Color that cast the spell. Purely informational (for UI hover text). */
  caster: Color
  /** Absolute ply count at which the effect expires (becomes inactive).
   *  The engine treats the effect as active iff `currentPly < expiresAtPly`.
   *  Phantom is also dropped early when the affected piece moves (one-shot
   *  consumption). */
  expiresAtPly: number
}

export type Spell =
  | { id: 'freeze';  cost: number; target: 'enemy-piece';  effectKind: 'freeze' }
  | { id: 'confuse'; cost: number; target: 'enemy-piece';  effectKind: 'confuse' }
  | { id: 'shield';  cost: number; target: 'own-piece';    effectKind: 'shield' }
  | { id: 'phantom'; cost: number; target: 'own-piece';    effectKind: 'phantom' }
  | { id: 'teleport'; cost: number; target: 'own-pair' }
  | { id: 'summon';   cost: number; target: 'empty-own-half' }
  | { id: 'extra-time'; cost: number; target: 'self' }

export type SpellId = Spell['id']

export type WizardStatus =
  | { kind: 'in_progress'; turn: Color }
  | { kind: 'king_captured'; winner: Color }

/** A move OR a spell — both consume the caster's turn. */
export type WizardActionRecord =
  | { kind: 'move'; from: Square; to: Square; color: Color; piece: string; captured?: string }
  | { kind: 'spell'; spellId: SpellId; color: Color; targets: Square[] }

export interface SpellTargetSpec {
  /** What `castSpell` will accept. 0 = self-cast (no board target). */
  arity: 0 | 1 | 2
  /** Filter helper for the UI: returns true if `square` is a legal first
   *  target right now. Omit for arity-0 spells. */
  isValidFirstTarget?(square: Square, board: BoardView, caster: Color): boolean
  /** For 2-arity spells only — given a first target, which squares are valid
   *  as the second? Defaults to "not the first square". */
  isValidSecondTarget?(square: Square, firstTarget: Square, board: BoardView, caster: Color): boolean
}

/** Read-only view of the board for spell target validators. */
export interface BoardView {
  pieceAt(sq: Square): { type: string; color: Color } | null
  hasEffect(sq: Square, kind: EffectKind): boolean
  isInOwnHalf(sq: Square, color: Color): boolean
}
