// Castle-points decay.
//
// Three-tier ramp tuned to be kid-friendly: a week of grace, then a
// gentle nudge, then real pressure to return.
//
//   Days 0–7   : 0 / day   (vacation week — never punished)
//   Days 8–30  : 1 / day   (~23 pt over the second/third week)
//   Days 31+   : 5 / day   (real pressure; ~150 pt by day 60)
//
// Past day 90 the cleanupDormantGuests scheduler deletes the account
// outright once the balance has been ground to zero.

const DAY_MS = 24 * 60 * 60 * 1000

const GRACE_DAYS = 7
const TIER2_END_DAY = 30
const TIER2_PER_DAY = 1
const TIER3_PER_DAY = 5

export function computeDecay(daysAbsent: number): number {
  if (daysAbsent <= GRACE_DAYS) return 0
  const tier2Days = Math.min(daysAbsent, TIER2_END_DAY) - GRACE_DAYS
  const tier3Days = Math.max(0, daysAbsent - TIER2_END_DAY)
  return tier2Days * TIER2_PER_DAY + tier3Days * TIER3_PER_DAY
}

/** Apply decay to a guest's points based on time since their last visit.
 *  Returns the post-decay balance + how much was taken. */
export function applyDecay(
  castlePoints: number,
  lastVisitAt: number,
  now: number,
): { castlePoints: number; decayedBy: number } {
  const elapsed = now - lastVisitAt
  if (elapsed <= 0) return { castlePoints, decayedBy: 0 }
  const days = Math.floor(elapsed / DAY_MS)
  const raw = computeDecay(days)
  const decayedBy = Math.min(castlePoints, raw)
  return { castlePoints: castlePoints - decayedBy, decayedBy }
}
