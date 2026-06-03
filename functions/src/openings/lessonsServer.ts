// Server-side mirror of the opening lesson catalogue.
//
// The client list lives at apps/web/src/openings/openings.ts. The
// server only needs to know the opening ids and how many positions
// each one has — dedupe is by position INDEX, not content, so
// reordering positions in the client would re-award (acceptable
// given the modest reward).

export const OPENING_POSITION_COUNT: Record<string, number> = {
  italian: 6,
  'ruy-lopez': 6,
  'queens-gambit': 6,
}

export const OPENING_POSITION_REWARD_PTS = 5
/** One-time bonus when the kid clears every position in an opening. */
export const OPENING_MASTER_BONUS_PTS = 20

export function isKnownOpeningPosition(
  openingId: string,
  positionIndex: number,
): boolean {
  const count = OPENING_POSITION_COUNT[openingId]
  if (count === undefined) return false
  return (
    Number.isInteger(positionIndex) &&
    positionIndex >= 0 &&
    positionIndex < count
  )
}
