// Balance gate: the greedy bot (sim/autoplay.ts — no spells, no mazing,
// no selling) must clear the targets below on every seed. It is a floor:
// a child with spells does better. Tune content/ until it holds and touch
// sim/defs.ts only as a last resort. The final table lives in
// docs/SIEGE_DESIGN.md §6 "Balance" — update it when this one moves.
import { beforeAll, describe, expect, it } from 'vitest'
import type { MapDef } from '../sim/types'
import { TOWER_DEFS } from '../sim/defs'
import { runAutoplay, type AutoplayResult } from '../sim/autoplay'
import { CAMPAIGN } from './campaign'
import { endlessWaveGenerator } from './endless'

const SEEDS = [1, 2, 3]
/** Maps 9–12: the bot must reach this fraction of the waves (winning is fine). */
const LATE_REACH = 0.65
/** Endless: the wave the bot must reach. Reaching 12 on courtyard-gate
 *  also means it survived the boss waves 5 (Black Knight) and 10 (Iron Rook). */
const ENDLESS_TARGET: Record<string, number> = { 'courtyard-gate': 12, 'lava-steps': 8 }
/** Endless runs stop here (counted as a win) so the file stays fast. */
const ENDLESS_CAP = 20
const BUDGET_MS = 60_000

interface Case {
  label: string
  map: MapDef
  seed: number
  endless: boolean
}

const CASES: Case[] = [
  ...CAMPAIGN.flatMap((map) => SEEDS.map((seed) => ({ label: `${map.id} seed ${seed}`, map, seed, endless: false }))),
  ...Object.keys(ENDLESS_TARGET).flatMap((id) => {
    const map = CAMPAIGN.find((m) => m.id === id)
    if (!map) throw new Error(`no map ${id}`)
    return SEEDS.map((seed) => ({ label: `endless ${map.id} seed ${seed}`, map, seed, endless: true }))
  }),
]

function play(c: Case): AutoplayResult {
  return c.endless
    ? runAutoplay(c.map, c.seed, { endlessWaves: ENDLESS_CAP, waveGenerator: endlessWaveGenerator(c.map, c.seed) })
    : runAutoplay(c.map, c.seed)
}

/** Why a run misses its target, or null when it meets it. */
function shortfall(c: Case, r: AutoplayResult): string | null {
  if (c.endless) {
    const want = ENDLESS_TARGET[c.map.id] ?? 0
    return r.wave >= want ? null : `reached wave ${r.wave} < ${want}`
  }
  const order = c.map.order
  if (order <= 2) return r.won && r.stars === 3 ? null : `wanted 3 stars, got ${r.won ? r.stars : 'a loss'}`
  if (order <= 8) return r.won ? null : `lost on wave ${r.wave}/${c.map.waves.length}`
  const want = Math.ceil(LATE_REACH * c.map.waves.length)
  return r.won || r.wave >= want ? null : `reached wave ${r.wave} < ${want} of ${c.map.waves.length}`
}

const results = new Map<string, AutoplayResult>()

describe('siege balance (greedy bot, no spells)', () => {
  beforeAll(() => {
    const t0 = Date.now()
    const lines = ['map                 seed  result  wave   lives  stars']
    for (const c of CASES) {
      const r = play(c)
      results.set(c.label, r)
      const total = c.endless ? `${ENDLESS_CAP}+` : String(c.map.waves.length)
      lines.push(
        [
          (c.endless ? `∞ ${c.map.id}` : c.map.id).padEnd(20),
          String(c.seed).padEnd(6),
          (r.won ? 'win' : 'loss').padEnd(8),
          `${r.wave}/${total}`.padEnd(7),
          String(r.lives).padEnd(7),
          c.endless ? '-' : String(r.stars),
        ].join(''),
      )
    }
    lines.push(`(${CASES.length} runs in ${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    console.log(lines.join('\n'))
  }, BUDGET_MS)

  it.each(CASES)('$label meets its target', (c) => {
    const r = results.get(c.label)
    expect(r).toBeDefined()
    if (!r) return
    expect(shortfall(c, r)).toBeNull()
  })

  it.each(CAMPAIGN)('$id: start gold buys at most three pawns', (map) => {
    const gold = map.modifiers.includes('lowBudget') ? 70 : map.startGold
    expect(Math.floor(gold / TOWER_DEFS.pawn.cost)).toBeLessThanOrEqual(3)
  })
})
