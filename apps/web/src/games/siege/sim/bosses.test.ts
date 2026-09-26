import { describe, expect, it } from 'vitest'
import type { BossId, Modifier } from './types'
import { LANE, LONG, mapOf, ofKind, park, run, wave } from './fixtures'
import { createSim } from './sim'

/** Starts a boss-only wave and ticks until the boss stands at the gate. */
function summon(boss: BossId, cells = LONG, modifiers: Modifier[] = []) {
  const sim = createSim({ map: mapOf(cells, { waves: [wave([], { boss })], modifiers, startGold: 5000 }), seed: 1, unlockedSpells: [] })
  sim.startWave()
  const events = run(sim, 1.6)
  const e = sim.state.boss
  if (!e) throw new Error('boss did not spawn')
  return { sim, boss: e, events }
}

describe('boss spawn + intro', () => {
  it('spawns from gate 0 after the last group with an intro that slows the sim', () => {
    const { sim, boss, events } = summon('blackKnight')
    expect(ofKind(events, 'bossSpawn')).toEqual([{ kind: 'bossSpawn', boss: 'blackKnight', enemyId: boss.id }])
    expect(boss.boss).toBe(true)
    expect(boss.hp).toBe(1800)
    expect(sim.state.introBoss).toBe('blackKnight')
    expect(sim.state.bossIntro).toBeGreaterThan(0)
    expect(sim.state.bossIntro).toBeLessThan(1)
    const t0 = sim.state.time
    run(sim, 1) // intro window 0.2..0.8 → sim runs at 0.25×
    expect(sim.state.time - t0).toBeLessThan(0.6)
    sim.skipIntro()
    expect(sim.state.bossIntro).toBe(1)
    expect(sim.state.introBoss).toBeNull()
  })

  it('pays out on defeat', () => {
    const { sim, boss } = summon('blackKnight')
    sim.skipIntro()
    boss.hp = 1
    sim.build({ c: 1, r: 0 }, 'pawn') // covers (2,1)
    park(boss, 2, 1)
    const events = run(sim, 1)
    expect(ofKind(events, 'bossDefeat')).toHaveLength(1)
    expect(ofKind(events, 'kill')[0]?.reward).toBe(150)
    expect(sim.state.boss).toBeNull()
    expect(sim.state.gold).toBe(5000 - 40 + 24 + 150 + 28) // early start + reward + wave bonus
  })
})

describe('Iron Rook', () => {
  it('drops a shield layer of armour per phase', () => {
    const { sim, boss } = summon('ironRook')
    sim.skipIntro()
    expect(boss.maxHp).toBe(2600)
    expect(boss.shieldLayers).toBe(2)
    expect(boss.armor).toBeCloseTo(0.6, 5)
    boss.hp = boss.maxHp * 0.6
    const p1 = ofKind(sim.tick(1 / 20), 'bossPhase')
    expect(p1).toEqual([{ kind: 'bossPhase', boss: 'ironRook', phase: 1 }])
    expect(boss.shieldLayers).toBe(1)
    expect(boss.armor).toBeCloseTo(0.45, 5)
    boss.hp = boss.maxHp * 0.3
    sim.tick(1 / 20)
    expect(boss.phase).toBe(2)
    expect(boss.shieldLayers).toBe(0)
    expect(boss.armor).toBeCloseTo(0.3, 5)
    boss.hp = boss.maxHp // a heal never rewinds a phase
    sim.tick(1 / 20)
    expect(boss.phase).toBe(2)
  })

  it('EMP telegraphs a ring then stuns the towers inside it', () => {
    const { sim, boss } = summon('ironRook')
    sim.skipIntro()
    park(boss, 3, 1)
    sim.build({ c: 4, r: 0 }, 'pawn') // inside r2
    sim.build({ c: 9, r: 0 }, 'pawn') // outside
    const before = run(sim, 10) // boss spawned at 1.5 s; first EMP at 11.5
    expect(ofKind(before, 'telegraph')).toHaveLength(1)
    expect(sim.state.telegraphs[0]?.kind).toBe('ring')
    expect(sim.state.telegraphs[0]?.ability).toBe('emp')
    expect(ofKind(before, 'stun')).toHaveLength(0)
    const after = run(sim, 1.6)
    expect(ofKind(after, 'bossAbility').map((a) => a.ability)).toEqual(['emp'])
    const stunned = ofKind(after, 'stun')
    expect(stunned).toHaveLength(1)
    expect(stunned[0]?.seconds).toBe(3)
    expect(sim.towerAt({ c: 4, r: 0 })?.stunnedUntil).toBeGreaterThan(sim.state.time)
    expect(sim.towerAt({ c: 9, r: 0 })?.stunnedUntil).toBe(0)
  })

  it('ignores the shielded modifier (bosses keep the table armour)', () => {
    const { boss } = summon('ironRook', LONG, ['shielded'])
    expect(boss.armor).toBeCloseTo(0.6, 5)
  })
})

describe('Frost Bishop', () => {
  it('teleports back along its trail and heals 10 % once per phase', () => {
    const { sim, boss } = summon('frostBishop')
    sim.skipIntro()
    run(sim, 4.2) // ~4 cells at 1 cell/s
    expect(boss.pos.x).toBeGreaterThan(4)
    const progress = boss.progress
    boss.hp = boss.maxHp * 0.55
    const events = sim.tick(1 / 20)
    expect(ofKind(events, 'bossAbility').map((a) => a.ability)).toEqual(['teleportBack'])
    expect(boss.pos.x).toBeLessThan(0.6) // back at the gate (plus a step or two)
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.65, 3)
    expect(boss.progress).toBeLessThan(progress)
    boss.hp = boss.maxHp * 0.25
    const again = sim.tick(1 / 20)
    expect(ofKind(again, 'bossAbility').map((a) => a.ability)).toEqual(['teleportBack'])
    expect(boss.phase).toBe(2)
  })

  it('freezes towers on its diagonals after a line telegraph', () => {
    const { sim, boss } = summon('frostBishop')
    sim.skipIntro()
    park(boss, 3, 1)
    sim.build({ c: 5, r: 0 }, 'pawn') // not on a diagonal of (3,1)
    sim.build({ c: 4, r: 0 }, 'pawn') // on the up-right diagonal
    const events = run(sim, 9.2 + 1.6) // spawn 1.5 + 9 telegraph + 1.5 execute = 12 < 12.4
    expect(ofKind(events, 'telegraph')).toHaveLength(1)
    const stunned = ofKind(events, 'stun')
    expect(stunned).toHaveLength(1)
    expect(stunned[0]?.towerId).toBe(sim.towerAt({ c: 4, r: 0 })?.id)
    expect(stunned[0]?.seconds).toBe(4)
  })

  it('takes only half a slow', () => {
    const { sim, boss } = summon('frostBishop')
    sim.skipIntro()
    sim.build({ c: 2, r: 0 }, 'bishop')
    const t = sim.towerAt({ c: 2, r: 0 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    sim.chooseBranch(t.id, 'frost')
    park(boss, 3, 1)
    sim.tick(1 / 20)
    expect(boss.speedMult).toBe(0.55)
    expect(boss.slowUntil).toBeCloseTo(sim.state.time + 0.75, 1)
  })
})

describe('Shadow Queen', () => {
  it('splits into decoys once; decoys leak 2 and pay nothing', () => {
    const { sim, boss } = summon('shadowQueen', LANE)
    sim.skipIntro()
    park(boss, 2, 2, 2)
    boss.hp = boss.maxHp * 0.5
    const events = sim.tick(1 / 20)
    expect(ofKind(events, 'bossAbility').map((a) => a.ability)).toEqual(['split'])
    const decoys = sim.state.enemies.filter((e) => e.decoy)
    expect(decoys).toHaveLength(2)
    for (const d of decoys) {
      expect(d.boss).toBe(false)
      expect(d.type).toBe('shadowQueen')
      expect(d.maxHp).toBeCloseTo(2600 * 0.25, 5)
      expect(d.progress).toBeGreaterThanOrEqual(2) // inherited, then a step or two of walking
      expect(d.progress).toBeLessThan(2.2)
    }
    expect(sim.state.boss).toBe(boss)
    const gold = sim.state.gold
    run(sim, 8) // decoys walk the remaining ~5 cells at 1.1 c/s
    expect(sim.state.lives).toBe(20 - 4)
    expect(sim.state.enemies.filter((e) => e.decoy)).toHaveLength(0)
    expect(sim.state.gold).toBe(gold)
    boss.hp = boss.maxHp * 0.1
    sim.tick(1 / 20)
    expect(sim.state.enemies.filter((e) => e.decoy)).toHaveLength(0)
  })
})

describe('Black Knight + Dark King', () => {
  it('dashes three cells after a telegraph', () => {
    const { sim, boss } = summon('blackKnight')
    sim.skipIntro()
    const events = run(sim, 6.2) // first dash telegraph at spawn + 6
    const tg = sim.state.telegraphs[0]
    expect(tg?.kind).toBe('cells')
    expect(tg?.cells).toHaveLength(3)
    expect(ofKind(events, 'telegraph')).toHaveLength(1)
    const x0 = boss.pos.x
    const t0 = sim.state.time
    const later = run(sim, 1.6) // telegraph ends after 1.2 s; then 0.4 s of dash
    expect(ofKind(later, 'bossAbility').map((a) => a.ability)).toEqual(['dash'])
    const plain = (sim.state.time - t0) * 1.3
    expect(boss.pos.x - x0).toBeGreaterThan(plain + 1.5)
  })

  it('summons knights beside itself from phase two', () => {
    const { sim, boss } = summon('blackKnight')
    sim.skipIntro()
    park(boss, 5, 1, 5)
    boss.hp = boss.maxHp * 0.5
    sim.tick(1 / 20)
    expect(boss.phase).toBe(1)
    run(sim, 12.2)
    const knights = sim.state.enemies.filter((e) => e.type === 'knight')
    expect(knights).toHaveLength(4)
    expect(knights[0]?.progress).toBeGreaterThanOrEqual(5) // inherits the boss's progress
    expect(Math.abs((knights[0]?.pos.x ?? 0) - 5.5)).toBeLessThan(1)
  })

  it('the Dark King calls pawns from the gate and heals allies near him', () => {
    const { sim, boss } = summon('darkKing')
    sim.skipIntro()
    park(boss, 6, 1, 6)
    const events = run(sim, 17.5) // spawn 1.5 + 15 call + 6 × 0.4 s gaps
    expect(ofKind(events, 'bossAbility').map((a) => a.ability)).toEqual(['callWave'])
    const pawns = sim.state.enemies.filter((e) => e.type === 'pawn')
    expect(pawns).toHaveLength(6)
    expect(pawns[0]?.progress).toBeGreaterThan(0) // walked in from gate 0
    const near = pawns[0]
    if (!near) throw new Error('no pawn')
    near.hp = 10
    park(near, 7, 1)
    run(sim, 1)
    expect(near.hp).toBeGreaterThan(20) // 15 hp/s heal aura
    boss.hp = boss.maxHp * 0.2
    sim.tick(1 / 20)
    expect(boss.phase).toBe(3)
    park(boss, 6, 1, 6)
    boss.frozenUntil = 0
    run(sim, 1)
    expect(boss.pos.x - 6.5).toBeCloseTo(0.8 * 1, 0)
  })
})
