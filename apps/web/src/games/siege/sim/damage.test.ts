import { describe, expect, it } from 'vitest'
import type { EnemyType } from './types'
import { LANE, group, mapOf, ofKind, park, run, spawnNow, wave } from './fixtures'
import { createSim } from './sim'

/** A LANE sim with one wave of the given enemies, spawned and parked. */
function arena(types: EnemyType[], modifiers: ('shielded' | 'rush')[] = []) {
  const groups = types.map((t) => group(t, 1))
  const sim = createSim({ map: mapOf(LANE, { waves: [wave(groups)], modifiers, startGold: 5000 }), seed: 1, unlockedSpells: [] })
  return sim
}

describe('damage math', () => {
  it('armour removes its fraction; Siege rook pierces it', () => {
    const sim = arena(['rook'])
    sim.build({ c: 3, r: 1 }, 'rook')
    spawnNow(sim)
    const e = sim.state.enemies[0]
    if (!e) throw new Error('no enemy')
    park(e, 3, 2)
    const hit = ofKind(sim.tick(1 / 20), 'hit')[0]
    expect(hit?.damage).toBe(30)
    expect(e.hp).toBe(390)

    const pierce = arena(['rook'])
    pierce.build({ c: 3, r: 1 }, 'rook')
    const t = pierce.towerAt({ c: 3, r: 1 })
    if (!t) throw new Error('no tower')
    pierce.upgrade(t.id)
    pierce.chooseBranch(t.id, 'siege')
    spawnNow(pierce)
    const e2 = pierce.state.enemies[0]
    if (!e2) throw new Error('no enemy')
    park(e2, 3, 2)
    expect(ofKind(pierce.tick(1 / 20), 'hit')[0]?.damage).toBe(120)
  })

  it('shielded adds 0.2 armour to everyone', () => {
    const sim = arena(['pawn', 'queen'], ['shielded'])
    spawnNow(sim)
    expect(sim.state.enemies.map((e) => e.armor)).toEqual([0.2, 0.5])
  })

  it('splash hits neighbours within the radius for half', () => {
    const sim = arena(['pawn', 'pawn', 'pawn'])
    sim.build({ c: 3, r: 1 }, 'knight') // reaches (5,2) and (1,2) on the road
    spawnNow(sim)
    const [main, near, farAway] = sim.state.enemies
    if (!main || !near || !farAway) throw new Error('expected three pawns')
    park(main, 5, 2, 5)
    park(near, 4, 2, 4)
    park(farAway, 2, 2, 2)
    sim.tick(1 / 20)
    expect(main.hp).toBe(60 - 34)
    expect(near.hp).toBe(60 - 17)
    expect(farAway.hp).toBe(60)
    expect(sim.state.projectiles[0]?.kind).toBe('jump')
  })

  it('slow sets the multiplier, refreshes without stacking, and skips knights', () => {
    const sim = arena(['rook', 'knight']) // a rook survives two volleys
    sim.build({ c: 2, r: 1 }, 'bishop') // diagonal down-right → (3,2)
    const t = sim.towerAt({ c: 2, r: 1 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    sim.chooseBranch(t.id, 'frost')
    spawnNow(sim)
    const [pawn, knight] = sim.state.enemies
    if (!pawn || !knight) throw new Error('expected two enemies')
    park(pawn, 3, 2, 3) // the rook, on the (2,1) → (3,2) diagonal
    park(knight, 1, 2, 1) // (1,2) is on the other diagonal: (2,1) → (1,2)
    sim.tick(1 / 20)
    expect(pawn.speedMult).toBe(0.55)
    const firstUntil = pawn.slowUntil
    expect(firstUntil).toBeCloseTo(sim.state.time + 1.5, 1)
    expect(knight.speedMult).toBe(1)
    run(sim, 1) // a second volley lands
    expect(pawn.speedMult).toBe(0.55)
    expect(pawn.slowUntil).toBeGreaterThan(firstUntil)
  })

  it('burn ticks armour-piercing damage over time', () => {
    const sim = arena(['rook'])
    sim.build({ c: 2, r: 1 }, 'bishop')
    const t = sim.towerAt({ c: 2, r: 1 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    sim.chooseBranch(t.id, 'sun')
    spawnNow(sim)
    const e = sim.state.enemies[0]
    if (!e) throw new Error('no enemy')
    park(e, 3, 2)
    sim.tick(1 / 20)
    expect(e.burnDps).toBe(12)
    expect(e.burnUntil).toBeCloseTo(sim.state.time + 3, 1)
    const after = e.hp
    sim.sell(t.id) // only the burn is left
    run(sim, 1)
    expect(after - e.hp).toBeCloseTo(12, 0)
  })

  it('chain lightning jumps to the nearest un-hit enemy with falloff', () => {
    const sim = arena(['pawn', 'pawn', 'pawn'])
    sim.build({ c: 3, r: 1 }, 'knight')
    const t = sim.towerAt({ c: 3, r: 1 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    sim.chooseBranch(t.id, 'storm')
    spawnNow(sim)
    const [a, b, c] = sim.state.enemies
    if (!a || !b || !c) throw new Error('expected three pawns')
    park(a, 5, 2, 5)
    park(b, 3, 2, 3) // 2 cells from a: chain only, outside splash r1
    park(c, 1, 2, 1) // 2 cells from b
    const hits = ofKind(sim.tick(1 / 20), 'hit')
    expect(hits.map((h) => [h.enemyId, Number(h.damage.toFixed(2))])).toEqual([
      [a.id, 48],
      [b.id, 28.8],
      [c.id, 17.28],
    ])
    expect(sim.state.beams.filter((x) => x.kind === 'chain')).toHaveLength(2)
  })

  it('king aura multiplies damage and Treasury pays extra gold', () => {
    const sim = arena(['pawn'])
    sim.build({ c: 3, r: 1 }, 'king')
    const king = sim.towerAt({ c: 3, r: 1 })
    if (!king) throw new Error('no king')
    sim.upgrade(king.id)
    sim.chooseBranch(king.id, 'treasury')
    sim.build({ c: 4, r: 1 }, 'pawn') // buffed: 12 × 1.4 = 16.8
    spawnNow(sim)
    const e = sim.state.enemies[0]
    if (!e) throw new Error('no enemy')
    park(e, 5, 2)
    expect(ofKind(sim.tick(1 / 20), 'hit')[0]?.damage).toBeCloseTo(16.8, 5)
    e.hp = 1
    const gold = sim.state.gold
    const kill = ofKind(run(sim, 1), 'kill')[0]
    expect(kill?.reward).toBe(9) // 6 × 1.5
    expect(sim.state.gold).toBe(gold + 9 + 28) // + wave-clear bonus
  })

  it('five kills inside 1.5 s make a combo', () => {
    const sim = arena(['pawn', 'pawn', 'pawn', 'pawn', 'pawn'])
    sim.build({ c: 3, r: 1 }, 'rook')
    const t = sim.towerAt({ c: 3, r: 1 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    sim.chooseBranch(t.id, 'cannon') // 95 dmg, splash r1
    spawnNow(sim)
    for (const e of sim.state.enemies) {
      park(e, 3, 2)
      e.hp = 40 // the 50 % splash (47.5) finishes the other four
    }
    const events = sim.tick(1 / 20)
    expect(ofKind(events, 'kill')).toHaveLength(5)
    expect(ofKind(events, 'combo')).toEqual([{ kind: 'combo', count: 5 }])
    expect(sim.state.score).toBe(30 + 28 + 25 + 1500) // rewards + wave bonus + combo + 3 stars
  })

  it('rush speeds enemies up by 25 %', () => {
    const sim = arena(['pawn'], ['rush'])
    spawnNow(sim)
    run(sim, 2)
    expect(sim.state.enemies[0]?.pos.x).toBeCloseTo(0.5 + 2 * 1.25, 1)
  })
})
