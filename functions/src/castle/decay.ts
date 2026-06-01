// Castle-points decay (§7.4 of MVP2_PLAN).
//
// Linear ramp: 1 day absent loses 5 pts, 7 days loses 50.
//   decay(d) = round(5 + (d - 1) * 7.5) for d >= 1
//   decay(0) = 0 (same day → no decay)
// Past day 7 it keeps climbing linearly; the application step caps at the
// guest's current point balance so points never go negative.

const DAY_MS = 24 * 60 * 60 * 1000

export function computeDecay(daysAbsent: number): number {
  if (daysAbsent < 1) return 0
  return Math.round(5 + (daysAbsent - 1) * 7.5)
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
  const days = elapsed / DAY_MS
  const raw = computeDecay(days)
  const decayedBy = Math.min(castlePoints, raw)
  return { castlePoints: castlePoints - decayedBy, decayedBy }
}
