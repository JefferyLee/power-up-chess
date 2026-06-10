// Shared lookup for the dynamic Wizard's Duel entry threshold.
//
// The gate is the LOOSER of two limits:
//   • WIZARD_ABSOLUTE_FLOOR (1000 castle points) — never goes higher.
//   • The rolling top-10 % minimum recorded in castle_public/stats by
//     refreshCastlePublicStats. When the leaderboard's bottom is below
//     1000 (typical early-population state), this pulls the gate down
//     so the duel isn't gatekept by a fixed cliff.
//
// Used by createWizardRoom + joinWizardRoom (the standalone open/join
// paths) and by the invitation system's sendInvite + respondInvite
// when kind === 'wizard'.

import type { Firestore } from 'firebase-admin/firestore'
import { WIZARD_ABSOLUTE_FLOOR, type CastlePublicStats } from '../../castle/types'

export async function wizardGateMinPoints(db: Firestore): Promise<number> {
  const snap = await db.doc('castle_public/stats').get()
  const stats = snap.data() as CastlePublicStats | undefined
  const v = stats?.wizardGateMinPoints
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return Math.min(WIZARD_ABSOLUTE_FLOOR, v)
  }
  return WIZARD_ABSOLUTE_FLOOR
}
