// Effective spell-cost calculator + atomic supply-debit helper.
//
// Cost = base × personalMultiplier × supplyMultiplier
//
//   • base comes from spells.ts SPELLS[]
//   • personalMultiplier from this uid's cast-count this rolling 24h
//   • supplyMultiplier from castle-wide remaining supply this 24h
//
// Both multipliers are read AND incremented inside the same Firestore
// transaction as submitWizardSpell's main writes so we never charge a
// stale price or over-debit supply.

import { FieldValue, Transaction } from 'firebase-admin/firestore'
import {
  PERSONAL_SURGE,
  spellById,
  SPELL_DAILY_SUPPLY,
  SUPPLY_SURGE,
} from './spells'
import type { SpellId } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SpellPricing {
  /** Final integer cost in castle points (already rounded up). */
  effectiveCost: number
  /** Base cost as listed in the Spellbook. */
  baseCost: number
  /** Personal multiplier (1.0 / 1.5 / 2.0) that contributed. */
  personalMultiplier: number
  /** Supply multiplier (1.0 / 2.0 / 5.0) that contributed. */
  supplyMultiplier: number
  /** Remaining castle-wide supply AFTER this cast (informational). */
  supplyRemaining: number
  /** Caller's cast count this 24h AFTER this cast (informational). */
  personalCastCount: number
}

/** Read pricing state, compute effective cost, atomically reserve one
 *  use from supply + bump the personal counter. Throws HttpsError-like
 *  errors via the caller; we just throw plain Error here and let the
 *  wrapping function translate.
 *
 *  Returns null if the global supply is exhausted (caller should reject). */
export async function reserveAndPriceSpell(
  tx: Transaction,
  uid: string,
  spellId: SpellId,
  now: number,
  db: FirebaseFirestore.Firestore,
): Promise<SpellPricing | null> {
  const supplyRef = db.doc(`castle_spell_supply/${spellId}`)
  const personalRef = db.doc(`wizard_spell_quota/${uid}_${spellId}`)

  const [supplySnap, personalSnap] = await Promise.all([
    tx.get(supplyRef),
    tx.get(personalRef),
  ])

  const ceiling = SPELL_DAILY_SUPPLY[spellId]
  const supplyData = supplySnap.data() as { remaining?: number; windowStart?: number } | undefined
  const supplyWindowFresh =
    !supplyData?.windowStart || now - supplyData.windowStart >= DAY_MS
  const supplyRemainingBefore = supplyWindowFresh
    ? ceiling
    : Math.max(0, supplyData?.remaining ?? ceiling)

  if (supplyRemainingBefore <= 0) {
    return null  // sold out — caller throws "spell unavailable today"
  }

  const personalData = personalSnap.data() as { count?: number; windowStart?: number } | undefined
  const personalFresh =
    !personalData?.windowStart || now - personalData.windowStart >= DAY_MS
  const personalCountBefore = personalFresh ? 0 : (personalData?.count ?? 0)

  // Compute multipliers based on state BEFORE this cast.
  const personalMultiplier = personalMultFor(personalCountBefore)
  const supplyMultiplier = supplyMultFor(supplyRemainingBefore, ceiling)

  const baseCost = spellById(spellId).cost
  const effectiveCost = Math.ceil(baseCost * personalMultiplier * supplyMultiplier)

  // Reserve: bump personal counter + decrement supply.
  const personalCountAfter = personalCountBefore + 1
  const supplyRemainingAfter = supplyRemainingBefore - 1

  tx.set(personalRef, {
    count: personalCountAfter,
    windowStart: personalFresh ? now : (personalData?.windowStart ?? now),
  })
  tx.set(supplyRef, {
    remaining: supplyRemainingAfter,
    windowStart: supplyWindowFresh ? now : (supplyData?.windowStart ?? now),
  })

  return {
    effectiveCost,
    baseCost,
    personalMultiplier,
    supplyMultiplier,
    supplyRemaining: supplyRemainingAfter,
    personalCastCount: personalCountAfter,
  }
}

/** Reverse a reservation if the spell ends up not being cast (illegal
 *  target, transaction abort, etc.). Currently unused — submitWizardSpell
 *  validates legality BEFORE calling reserveAndPriceSpell. Kept for
 *  symmetry in case of future refactors. */
export function refundReservation(
  tx: Transaction,
  uid: string,
  spellId: SpellId,
  db: FirebaseFirestore.Firestore,
): void {
  tx.update(db.doc(`wizard_spell_quota/${uid}_${spellId}`), { count: FieldValue.increment(-1) })
  tx.update(db.doc(`castle_spell_supply/${spellId}`), { remaining: FieldValue.increment(+1) })
}

function personalMultFor(prevCount: number): number {
  if (prevCount < PERSONAL_SURGE.baseThreshold) return 1.0
  if (prevCount < PERSONAL_SURGE.high.afterCasts) return PERSONAL_SURGE.mid.multiplier
  return PERSONAL_SURGE.high.multiplier
}

function supplyMultFor(remainingBefore: number, ceiling: number): number {
  const frac = remainingBefore / ceiling
  if (frac >= SUPPLY_SURGE.abundant.minFraction) return SUPPLY_SURGE.abundant.multiplier
  if (frac >= SUPPLY_SURGE.scarce.minFraction) return SUPPLY_SURGE.scarce.multiplier
  return SUPPLY_SURGE.critical.multiplier
}
