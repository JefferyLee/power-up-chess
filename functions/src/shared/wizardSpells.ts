// Wizard's Duel spell catalogue + target rules — SINGLE SOURCE OF TRUTH
// (Phase 3.1). Server-only pricing/economy constants live in
// functions/src/games/wizard/spells.ts.

import type { Color, Square } from './chessTypes'
import type { Spell, SpellId, SpellTargetSpec } from './wizardTypes'

export const SPELLS: Spell[] = [
  { id: 'freeze',     cost: 4,  target: 'enemy-piece' ,    effectKind: 'freeze' },
  { id: 'confuse',    cost: 3,  target: 'enemy-piece',     effectKind: 'confuse' },
  { id: 'shield',     cost: 5,  target: 'own-piece',       effectKind: 'shield' },
  { id: 'phantom',    cost: 7,  target: 'own-piece',       effectKind: 'phantom' },
  { id: 'teleport',   cost: 6,  target: 'own-pair' },
  { id: 'summon',     cost: 8,  target: 'empty-own-half' },
  { id: 'extra-time', cost: 10, target: 'self' },
]

export const SPELLS_BY_ID = new Map<SpellId, Spell>(SPELLS.map((s) => [s.id, s]))

export function spellById(id: SpellId): Spell {
  const s = SPELLS_BY_ID.get(id)
  if (!s) throw new Error(`Unknown spellId: ${id}`)
  return s
}

/** Target validators per spell. Centralised here so both the engine
 *  (canCastSpell) and the UI (highlighting valid squares) agree. */
export const TARGET_SPECS: Record<SpellId, SpellTargetSpec> = {
  freeze: {
    arity: 1,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return !!p && p.color !== caster
    },
  },
  confuse: {
    arity: 1,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return !!p && p.color !== caster
    },
  },
  shield: {
    arity: 1,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return !!p && p.color === caster
    },
  },
  phantom: {
    arity: 1,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return !!p && p.color === caster
    },
  },
  teleport: {
    arity: 2,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return !!p && p.color === caster
    },
    isValidSecondTarget(sq, first, board, caster) {
      if (sq === first) return false
      const p = board.pieceAt(sq)
      return !!p && p.color === caster
    },
  },
  summon: {
    arity: 1,
    isValidFirstTarget(sq, board, caster) {
      const p = board.pieceAt(sq)
      return p === null && board.isInOwnHalf(sq, caster)
    },
  },
  'extra-time': {
    // Self-cast — no board target. The UI fires it directly when picked.
    arity: 0,
  },
}

/** Convenience: which color's half does a square sit in? White's half is
 *  ranks 1-4 (the "bottom"); Black's is 5-8. */
export function isInHalfOf(square: Square, color: Color): boolean {
  const rank = Number(square[1])
  return color === 'w' ? rank >= 1 && rank <= 4 : rank >= 5 && rank <= 8
}
