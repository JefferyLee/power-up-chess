// Spellbook catalogue for Wizard's Duel. Costs + target rules from
// docs/WIZARDS_DUEL_DRAFT.md §2.3. Numbers are starting points and
// will be tuned after Ada actually plays a duel.

import type { Color, Square } from '../../shared/chessTypes'
import type { Spell, SpellId, SpellTargetSpec } from './types'

export const SPELLS: Spell[] = [
  { id: 'freeze',     cost: 4,  target: 'enemy-piece' ,    effectKind: 'freeze' },
  { id: 'confuse',    cost: 3,  target: 'enemy-piece',     effectKind: 'confuse' },
  { id: 'shield',     cost: 5,  target: 'own-piece',       effectKind: 'shield' },
  { id: 'phantom',    cost: 7,  target: 'own-piece',       effectKind: 'phantom' },
  { id: 'teleport',   cost: 6,  target: 'own-pair' },
  { id: 'summon',     cost: 8,  target: 'empty-own-half' },
  { id: 'extra-time', cost: 10, target: 'self' },
]

/** Bonus seconds the 'extra-time' spell adds to the caster's clock. The
 *  server applies this in submitWizardSpell; the engine itself doesn't
 *  touch clocks. */
export const EXTRA_TIME_BONUS_MS = 60_000

/** Castle-wide daily supply ceiling per spell. When the rolling 24-hour
 *  pool drops below thresholds (see PRICING_THRESHOLDS) the spell's cost
 *  surges — a "rare item" effect that rewards spending earlier in the day. */
export const SPELL_DAILY_SUPPLY: Record<SpellId, number> = {
  freeze:       200,
  confuse:      200,
  shield:       150,
  phantom:       80,
  teleport:     100,
  summon:        50,   // rare + powerful
  'extra-time':  60,
}

/** Personal per-uid per-day cast-count surge thresholds. First two casts
 *  are at base price; 3rd costs 1.5×; 4th and beyond cost 2×. */
export const PERSONAL_SURGE = {
  baseThreshold: 2,    // casts 1-2 are 1.0×
  mid: { afterCasts: 2, multiplier: 1.5 },
  high: { afterCasts: 3, multiplier: 2.0 },
} as const

/** Castle-wide supply-pool surge. Multipliers stack with personal surge
 *  (multiplicatively) so a "late in the day on a popular spell" cast can
 *  cost ~10× base. supplyFraction = remaining / SPELL_DAILY_SUPPLY[id]. */
export const SUPPLY_SURGE = {
  abundant: { minFraction: 0.20, multiplier: 1.0 },
  scarce:   { minFraction: 0.05, multiplier: 2.0 },
  critical: { minFraction: 0.00, multiplier: 5.0 },
} as const

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
