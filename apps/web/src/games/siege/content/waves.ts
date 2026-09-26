import type { EnemyType, WaveGroup } from '../sim/types'

/** A spawn group: `count` enemies of `type`, one every `gap` s, starting
 *  `delay` s into the wave, from gate `gate` (default 0). */
export function g(type: EnemyType, count: number, gap: number, delay: number, gate?: number): WaveGroup {
  return gate === undefined ? { type, count, gap, delay } : { type, count, gap, delay, gate }
}
