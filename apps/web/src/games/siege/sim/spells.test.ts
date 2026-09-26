import { describe, expect, it } from 'vitest'
import { LANE, group, mapOf, ofKind, park, run, spawnNow, wave } from './fixtures'
import { createSim } from './sim'

function arena(unlocked: ('fork' | 'pin' | 'skewer' | 'castling')[] = ['fork', 'pin', 'skewer', 'castling']) {
  const map = mapOf(LANE, { waves: [wave([group('pawn', 3)])], startGold: 5000 })
  const sim = createSim({ map, seed: 1, unlockedSpells: unlocked })
  spawnNow(sim)
  const [a, b, c] = sim.state.enemies
  if (!a || !b || !c) throw new Error('expected three pawns')
  park(a, 2, 2, 2)
  park(b, 3, 2, 3)
  park(c, 4, 2, 4)
  return { sim, a, b, c }
}

describe('spells', () => {
  it('start ready only when unlocked, and refuse an empty target', () => {
    const { sim } = arena(['fork'])
    expect(sim.state.spells.fork).toEqual({ ready: true, cooldown: 0, unlocked: true })
    expect(sim.state.spells.pin.ready).toBe(false)
    expect(sim.castSpell('pin', { kind: 'cell', cell: { c: 3, r: 2 } })).toBe(false)
    expect(sim.castSpell('fork', { kind: 'cell', cell: { c: 7, r: 0 } })).toBe(false)
    expect(sim.state.spells.fork.ready).toBe(true)
  })

  it('Fork hits the two enemies furthest along inside the 5×5', () => {
    const { sim, a, b, c } = arena()
    expect(sim.castSpell('fork', { kind: 'cell', cell: { c: 2, r: 2 } })).toBe(true)
    const events = sim.tick(0)
    expect(ofKind(events, 'spell')).toEqual([{ kind: 'spell', spell: 'fork', at: { c: 2, r: 2 } }])
    expect(ofKind(events, 'kill').map((k) => k.enemyId).sort()).toEqual([b.id, c.id].sort())
    expect(a.hp).toBe(60)
    expect(sim.state.spells.fork).toEqual({ ready: false, cooldown: 30, unlocked: true })
    expect(sim.castSpell('fork', { kind: 'cell', cell: { c: 2, r: 2 } })).toBe(false)
  })

  it('Pin freezes a 3×3 for 3 s, bosses for 1.5 s', () => {
    const { sim, a, b, c } = arena()
    for (const e of [a, b, c]) e.frozenUntil = 0
    expect(sim.castSpell('pin', { kind: 'cell', cell: { c: 3, r: 2 } })).toBe(true)
    expect(a.frozenUntil).toBeCloseTo(sim.state.time + 3, 5)
    expect(b.frozenUntil).toBeCloseTo(sim.state.time + 3, 5)
    expect(c.frozenUntil).toBeCloseTo(sim.state.time + 3, 5)
    const x = b.pos.x
    run(sim, 2)
    expect(b.pos.x).toBe(x)
    const bossMap = mapOf(LANE, { waves: [wave([], { boss: 'ironRook' })] })
    const bossSim = createSim({ map: bossMap, seed: 1, unlockedSpells: ['pin'] })
    bossSim.startWave()
    run(bossSim, 1.6)
    bossSim.skipIntro()
    const boss = bossSim.state.boss
    if (!boss) throw new Error('no boss')
    expect(bossSim.castSpell('pin', { kind: 'cell', cell: { c: 0, r: 2 } })).toBe(true)
    expect(boss.frozenUntil).toBeCloseTo(bossSim.state.time + 1.5, 5)
  })

  it('Skewer pierces everyone on the row (or column) and draws one beam', () => {
    const { sim, a, b, c } = arena()
    a.armor = 0.5
    expect(sim.castSpell('skewer', { kind: 'line', cell: { c: 0, r: 2 }, orientation: 'row' })).toBe(true)
    const hits = ofKind(sim.tick(0), 'hit')
    expect(hits.map((h) => h.damage)).toEqual([90, 90, 90])
    expect([a, b, c].every((e) => e.hp <= 0)).toBe(true)
    expect(sim.state.beams).toHaveLength(1)
    expect(sim.state.beams[0]?.kind).toBe('skewer')
    expect(sim.state.beams[0]?.from).toEqual({ x: 0, y: 2.5 })
    expect(sim.state.beams[0]?.to).toEqual({ x: 8, y: 2.5 })

    const col = arena()
    expect(col.sim.castSpell('skewer', { kind: 'line', cell: { c: 3, r: 0 }, orientation: 'col' })).toBe(true)
    expect(ofKind(col.sim.tick(0), 'hit').map((h) => h.enemyId)).toEqual([col.b.id])
  })

  it('Castling swaps two pieces and clears their stun', () => {
    const { sim } = arena()
    sim.build({ c: 1, r: 1 }, 'pawn')
    sim.build({ c: 5, r: 3 }, 'rook')
    const p = sim.towerAt({ c: 1, r: 1 })
    const r = sim.towerAt({ c: 5, r: 3 })
    if (!p || !r) throw new Error('no towers')
    p.stunnedUntil = 99
    expect(sim.castSpell('castling', { kind: 'towers', a: p.id, b: p.id })).toBe(false)
    expect(sim.castSpell('castling', { kind: 'towers', a: p.id, b: r.id })).toBe(true)
    expect(sim.towerAt({ c: 1, r: 1 })?.type).toBe('rook')
    expect(sim.towerAt({ c: 5, r: 3 })?.type).toBe('pawn')
    expect(p.stunnedUntil).toBe(0)
    expect(ofKind(sim.tick(0), 'castling')).toEqual([{ kind: 'castling', a: { c: 1, r: 1 }, b: { c: 5, r: 3 } }])
  })

  it('cooldowns tick in wall time × speed', () => {
    const { sim } = arena()
    sim.castSpell('fork', { kind: 'cell', cell: { c: 3, r: 2 } })
    sim.setSpeed(2)
    run(sim, 1)
    expect(sim.state.spells.fork.cooldown).toBeCloseTo(28, 5)
    sim.setPaused(true)
    run(sim, 1)
    expect(sim.state.spells.fork.cooldown).toBeCloseTo(28, 5)
  })
})
