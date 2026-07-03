// Shared catalogue re-export + SERVER-ONLY economy constants (Phase 3.1).
export * from '../../shared/wizardSpells'

import type { SpellId } from '../../shared/wizardTypes'

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
