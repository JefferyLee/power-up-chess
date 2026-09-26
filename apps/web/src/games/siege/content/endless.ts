import type { BossId, EnemyType, MapDef, WaveDef } from '../sim/types'
import { mulberry32, pick } from './rng'
import { g } from './waves'

type Mix = ReadonlyArray<readonly [EnemyType, number]>

/** Enemy mixes, cycled wave after wave (weights are shares of the count). */
const CYCLE: readonly Mix[] = [
  [['pawn', 1]], // pawn flood
  [['knight', 0.6], ['pawn', 0.4]], // knight rush
  [['pawn', 0.6], ['bishop', 0.4]], // healer march
  [['rook', 0.4], ['bishop', 0.6]], // healer-escorted rooks
  [['knight', 1]], // pure rush
  [['queen', 0.2], ['bishop', 0.4], ['pawn', 0.4]], // royal guard
  [['rook', 0.3], ['knight', 0.4], ['bishop', 0.3]],
  [['queen', 0.35], ['rook', 0.3], ['bishop', 0.35]],
]
const ESCORT: Mix = [['pawn', 0.6], ['knight', 0.4]]

export const ENDLESS_BOSSES: readonly BossId[] = ['blackKnight', 'ironRook', 'frostBishop', 'shadowQueen', 'darkKing']

const GAP: Record<EnemyType, number> = { pawn: 0.7, knight: 0.45, bishop: 1.0, rook: 1.6, queen: 2.2 }

/** Heavy pieces arrive slowly: a wave carries at most ⌈w / n⌉ of these. */
const HEAVY_EVERY: Partial<Record<EnemyType, number>> = { bishop: 2, rook: 4, queen: 8 }
const HP_RAMP = 0.08

function countGates(map: MapDef): number {
  let n = 0
  for (const row of map.cells) for (const ch of row) if (ch === 'S') n++
  return Math.max(1, n)
}

const round2 = (x: number): number => Math.round(x * 100) / 100

/** Endless waves for a map: wave 1, 2, 3 … — deterministic for a seed.
 *  hpMult = 1 + 0.08 × wave; a boss every 5th wave, rotating through the
 *  five; groups alternate gates on multi-gate maps. */
export function endlessWaveGenerator(map: MapDef, seed: number): (wave: number) => WaveDef {
  const gates = countGates(map)
  return (wave) => {
    const w = Math.max(1, Math.floor(wave))
    const rng = mulberry32((seed + w * 0x9e3779b1) >>> 0)
    const boss = w % 5 === 0 ? pick(ENDLESS_BOSSES, (w / 5 - 1) % ENDLESS_BOSSES.length) : undefined
    const mix = boss ? ESCORT : pick(CYCLE, (w - 1) % CYCLE.length)
    const total = Math.round((8 + w * 2) * (boss ? 0.5 : 1) * (0.9 + rng() * 0.2))
    const groups = mix.map(([type, share], i) => {
      const every = HEAVY_EVERY[type]
      const count = Math.max(1, Math.min(Math.round(total * share), every ? Math.ceil(w / every) : Infinity))
      const gap = round2(GAP[type] * (0.85 + rng() * 0.3))
      const delay = round2(i * 3 + rng() * 2)
      return g(type, count, gap, delay, gates > 1 ? (w + i) % gates : undefined)
    })
    const def: WaveDef = { groups, hpMult: round2(1 + HP_RAMP * w) }
    if (boss) def.boss = boss
    return def
  }
}
