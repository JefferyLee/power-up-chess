import { describe, expect, it } from 'vitest'
import type { BossId, EnemyType, Modifier, SpellId, Theme, WaveDef } from '../sim/types'
import { CAMPAIGN, dailyChallenge, endlessWaveGenerator } from './index'
import { ENDLESS_BOSSES } from './endless'
import { BOSS_IDS, ENEMY_TYPES, parseMap, validateMap } from './validate'

// docs/SIEGE_DESIGN.md §6, one row per map.
interface Row {
  id: string
  theme: Theme
  cols: number
  rows: number
  waves: number
  gates: number
  open: boolean
  modifiers: Modifier[]
  boss?: BossId
  spell?: SpellId
}
const TABLE: Row[] = [
  { id: 'courtyard-gate', theme: 'courtyard', cols: 12, rows: 8, waves: 8, gates: 1, open: false, modifiers: [] },
  { id: 'kitchen-garden', theme: 'courtyard', cols: 14, rows: 9, waves: 10, gates: 1, open: false, modifiers: [], spell: 'fork' },
  { id: 'old-bridge', theme: 'courtyard', cols: 14, rows: 9, waves: 10, gates: 1, open: false, modifiers: [], boss: 'blackKnight' },
  { id: 'forest-path', theme: 'forest', cols: 16, rows: 10, waves: 10, gates: 2, open: false, modifiers: ['fog'], spell: 'pin' },
  { id: 'beekeepers-field', theme: 'forest', cols: 16, rows: 10, waves: 11, gates: 1, open: true, modifiers: [] },
  { id: 'iron-mine', theme: 'forest', cols: 16, rows: 10, waves: 12, gates: 1, open: false, modifiers: ['shielded'], boss: 'ironRook', spell: 'skewer' },
  { id: 'frozen-lake', theme: 'frost', cols: 16, rows: 11, waves: 12, gates: 1, open: true, modifiers: ['rush'] },
  { id: 'frost-chapel', theme: 'frost', cols: 16, rows: 11, waves: 12, gates: 1, open: false, modifiers: [], boss: 'frostBishop', spell: 'castling' },
  { id: 'lava-steps', theme: 'lava', cols: 18, rows: 11, waves: 13, gates: 2, open: false, modifiers: ['noQueens'] },
  { id: 'shadow-hall', theme: 'lava', cols: 18, rows: 11, waves: 13, gates: 1, open: true, modifiers: ['maxTowers8'], boss: 'shadowQueen' },
  { id: 'throne-approach', theme: 'throne', cols: 18, rows: 12, waves: 14, gates: 3, open: false, modifiers: ['lowBudget'] },
  { id: 'dark-throne', theme: 'throne', cols: 18, rows: 12, waves: 15, gates: 1, open: false, modifiers: ['shielded', 'rush'], boss: 'darkKing' },
]

// Base HP from §3/§4 — only for the "total HP rises" check.
const HP: Record<EnemyType, number> = { pawn: 60, knight: 45, bishop: 90, rook: 420, queen: 700 }
const BOSS_HP: Record<BossId, number> = { blackKnight: 1800, ironRook: 2600, frostBishop: 3600, shadowQueen: 5200, darkKing: 8000 }
const totalHp = (w: WaveDef): number =>
  w.groups.reduce((s, grp) => s + HP[grp.type] * grp.count, 0) * (w.hpMult ?? 1) + (w.boss ? BOSS_HP[w.boss] : 0)

// First map an enemy type may appear on.
const FIRST_MAP: Record<EnemyType, number> = { pawn: 1, knight: 1, bishop: 2, rook: 3, queen: 6 }

describe('campaign maps', () => {
  it('has the 12 maps of §6 in order', () => {
    expect(CAMPAIGN.map((m) => m.id)).toEqual(TABLE.map((r) => r.id))
    CAMPAIGN.forEach((m, i) => expect(m.order).toBe(i + 1))
  })

  it.each(TABLE)('$id matches the §6 row', (row) => {
    const map = CAMPAIGN.find((m) => m.id === row.id)
    expect(map).toBeDefined()
    if (!map) return
    expect(map.theme).toBe(row.theme)
    expect([map.cols, map.rows]).toEqual([row.cols, row.rows])
    expect(map.waves).toHaveLength(row.waves)
    expect([...map.modifiers].sort()).toEqual([...row.modifiers].sort())
    expect(map.unlocksSpell).toBe(row.spell)
    expect(map.lives).toBe(20)
    expect(map.startGold).toBe(map.order >= 9 ? 140 : 120)
    expect(map.intro.length).toBeGreaterThan(20)
    expect(map.subtitle.length).toBeGreaterThan(0)

    const parsed = parseMap(map)
    expect(parsed.gates).toHaveLength(row.gates)
    const open = map.cells.join('').includes('o')
    expect(open).toBe(row.open)
    if (row.open) {
      const cells = map.cells.join('')
      const openCount = [...cells].filter((ch) => ch === 'o').length
      expect(openCount / cells.length).toBeGreaterThan(0.5)
    }

    // Boss only on the last wave, and exactly the boss of the table.
    map.waves.forEach((w, i) => {
      if (i === map.waves.length - 1) expect(w.boss).toBe(row.boss)
      else expect(w.boss).toBeUndefined()
    })
  })

  it.each(CAMPAIGN)('$id has a sound grid and wave list', (map) => {
    expect(validateMap(map)).toEqual([])
    const parsed = parseMap(map)
    expect(parsed.rectangular).toBe(true)
    expect(parsed.goals).toHaveLength(1)
    expect(parsed.gates.length).toBeGreaterThanOrEqual(1)
    expect(parsed.buildable).toBeGreaterThanOrEqual(0.25)
  })

  it.each(CAMPAIGN)('$id introduces enemy types on schedule and ramps HP', (map) => {
    for (const w of map.waves) {
      for (const grp of w.groups) {
        expect(ENEMY_TYPES).toContain(grp.type)
        expect(FIRST_MAP[grp.type]).toBeLessThanOrEqual(map.order)
      }
      if (w.boss) expect(BOSS_IDS).toContain(w.boss)
    }
    const totals = map.waves.map(totalHp)
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1] ?? 0)
    const mults = map.waves.map((w) => w.hpMult ?? 1)
    for (let i = 1; i < mults.length; i++) expect(mults[i]).toBeGreaterThanOrEqual(mults[i - 1] ?? 0)
  })

  it('ramps hpMult from 1.0 on map 1 to about 2.2 on map 12', () => {
    expect(CAMPAIGN[0]?.waves[0]?.hpMult).toBe(1)
    const last = CAMPAIGN[11]?.waves.at(-1)?.hpMult ?? 0
    expect(last).toBeGreaterThanOrEqual(2.1)
    expect(last).toBeLessThanOrEqual(2.3)
  })

  it('multi-gate maps use every gate', () => {
    for (const map of CAMPAIGN) {
      const gates = parseMap(map).gates.length
      if (gates < 2) continue
      const used = new Set(map.waves.flatMap((w) => w.groups.map((grp) => grp.gate ?? 0)))
      expect([...used].sort()).toEqual([...Array(gates).keys()])
    }
  })
})

describe('endlessWaveGenerator', () => {
  const map = CAMPAIGN[3] // forest-path, two gates
  if (!map) throw new Error('no map')

  it('is deterministic for a seed and differs across seeds', () => {
    const a = endlessWaveGenerator(map, 42)
    const b = endlessWaveGenerator(map, 42)
    const c = endlessWaveGenerator(map, 43)
    for (let w = 1; w <= 20; w++) expect(a(w)).toEqual(b(w))
    const same = [1, 2, 3, 4, 6, 7].every((w) => JSON.stringify(a(w)) === JSON.stringify(c(w)))
    expect(same).toBe(false)
  })

  it('puts a rotating boss on waves 5/10/15/20/25 and none elsewhere', () => {
    const gen = endlessWaveGenerator(map, 7)
    for (let w = 1; w <= 30; w++) {
      const def = gen(w)
      if (w % 5 === 0) expect(def.boss).toBe(ENDLESS_BOSSES[(w / 5 - 1) % 5])
      else expect(def.boss).toBeUndefined()
    }
    expect([5, 10, 15, 20, 25].map((w) => gen(w).boss)).toEqual(ENDLESS_BOSSES)
  })

  it('scales hpMult as 1 + 0.08 × wave and grows the count', () => {
    const gen = endlessWaveGenerator(map, 1)
    expect(gen(1).hpMult).toBeCloseTo(1.08)
    expect(gen(10).hpMult).toBeCloseTo(1.8)
    const count = (w: number): number => gen(w).groups.reduce((s, grp) => s + grp.count, 0)
    expect(count(21)).toBeGreaterThan(count(1))
    expect(count(31)).toBeGreaterThan(count(11))
  })

  it('emits valid groups and alternates gates on multi-gate maps', () => {
    const gen = endlessWaveGenerator(map, 3)
    const gates = new Set<number>()
    for (let w = 1; w <= 12; w++) {
      const def = gen(w)
      const check = validateMap({ ...map, waves: [def] })
      expect(check).toEqual([])
      for (const grp of def.groups) gates.add(grp.gate ?? 0)
    }
    expect([...gates].sort()).toEqual([0, 1])
    const single = endlessWaveGenerator(CAMPAIGN[0] as typeof map, 3)
    for (let w = 1; w <= 6; w++) for (const grp of single(w).groups) expect(grp.gate).toBeUndefined()
  })
})

describe('dailyChallenge', () => {
  it('is deterministic per date', () => {
    const a = dailyChallenge(new Date(2026, 8, 25, 9, 0))
    const b = dailyChallenge(new Date(2026, 8, 25, 23, 30))
    expect(a.dateKey).toBe('2026-09-25')
    expect(a).toEqual(b)
    expect(a.map.id).toBe(b.map.id)
  })

  it('rotates through all 12 maps over 12 consecutive days', () => {
    const ids = new Set<string>()
    for (let d = 0; d < 12; d++) ids.add(dailyChallenge(new Date(2026, 0, 1 + d)).map.id)
    expect(ids.size).toBe(12)
    const today = dailyChallenge(new Date(2026, 8, 25))
    const tomorrow = dailyChallenge(new Date(2026, 8, 26))
    expect(today.map.id).not.toBe(tomorrow.map.id)
    expect(today.seed).not.toBe(tomorrow.seed)
  })

  it('picks 1–2 modifiers, never lowBudget with rush, never a duplicate of the map', () => {
    const ALL: Modifier[] = ['fog', 'noQueens', 'maxTowers8', 'lowBudget', 'rush', 'shielded', 'noKing']
    const counts = new Set<number>()
    for (let d = 0; d < 120; d++) {
      const { map, modifiers } = dailyChallenge(new Date(2026, 0, 1 + d))
      counts.add(modifiers.length)
      expect(modifiers.length).toBeGreaterThanOrEqual(1)
      expect(modifiers.length).toBeLessThanOrEqual(2)
      for (const m of modifiers) {
        expect(ALL).toContain(m)
        expect(map.modifiers).not.toContain(m)
      }
      const all = [...map.modifiers, ...modifiers]
      expect(all.includes('lowBudget') && all.includes('rush')).toBe(false)
      expect(new Set(modifiers).size).toBe(modifiers.length)
    }
    expect(counts).toEqual(new Set([1, 2]))
  })
})
