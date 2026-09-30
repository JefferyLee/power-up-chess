// Takeback ("悔棋") cost rules, shared by the local / AI / online
// screens. Mirror of TAKEBACK_COSTS in functions/src/rooms/takeback.ts
// — keep them in sync.

export const TAKEBACK_COSTS = [100, 200, 800] as const
export const MAX_TAKEBACKS = TAKEBACK_COSTS.length

/** Cost of the NEXT takeback given how many were already used this
 *  game, or null once the three-per-game limit is reached. */
export function takebackCost(usedSoFar: number): number | null {
  return usedSoFar >= 0 && usedSoFar < MAX_TAKEBACKS ? TAKEBACK_COSTS[usedSoFar]! : null
}
