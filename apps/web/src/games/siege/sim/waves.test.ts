import { describe, expect, it } from 'vitest'
import { LANE, group, mapOf, ofKind, run, simOf, wave } from './fixtures'
import { createSim } from './sim'

describe('build countdown', () => {
  it('starts wave 1 after 12 s (3 s under rush)', () => {
    const sim = simOf(LANE, { waves: [wave([group('pawn', 1)])] })
    expect(sim.state.countdown).toBe(12)
    expect(ofKind(run(sim, 11.9), 'waveStart')).toHaveLength(0)
    expect(ofKind(run(sim, 0.2), 'waveStart')).toEqual([{ kind: 'waveStart', wave: 1 }])
    const rush = simOf(LANE, { waves: [wave([group('pawn', 1)])], modifiers: ['rush'] })
    expect(rush.state.countdown).toBe(3)
  })

  it('starting early pays 2 gold per remaining whole second', () => {
    const sim = simOf(LANE, { waves: [wave([group('pawn', 1)])] })
    run(sim, 0.5)
    sim.startWave()
    expect(sim.state.gold).toBe(500 + 2 * 11)
    expect(sim.state.phase).toBe('wave')
    sim.startWave() // no-op outside the build phase
    expect(sim.state.gold).toBe(522)
  })

  it('spawns groups by delay and gap from the requested gate', () => {
    const map = mapOf(['S......G', 'S......#'], { waves: [wave([group('pawn', 3, 0.5), group('knight', 1, 0, 2, 1)])] })
    const sim = createSim({ map, seed: 1, unlockedSpells: [] })
    sim.startWave()
    expect(sim.state.pending).toBe(4)
    const spawns = ofKind(run(sim, 1.2), 'spawn')
    expect(spawns.map((s) => s.type)).toEqual(['pawn', 'pawn', 'pawn'])
    expect(sim.state.pending).toBe(1)
    const late = ofKind(run(sim, 1), 'spawn')
    expect(late).toHaveLength(1)
    expect(late[0]?.at).toEqual({ x: 0.5, y: 1.5 })
    expect(sim.state.pending).toBe(0)
  })
})

describe('a whole game', () => {
  const waves = [wave([group('pawn', 1)]), wave([group('pawn', 1)])]

  it('clears, pays the bonus, counts down 8 s, then wins with three stars', () => {
    const sim = simOf(LANE, { waves })
    sim.build({ c: 3, r: 1 }, 'rook') // 60 dmg one-shots a 60 hp pawn on (3,2)
    sim.startWave()
    const first = run(sim, 8)
    expect(ofKind(first, 'kill')).toHaveLength(1)
    expect(ofKind(first, 'waveClear')).toEqual([{ kind: 'waveClear', wave: 1, bonus: 28 }])
    expect(sim.state.phase).toBe('build')
    expect(sim.state.countdown).toBeGreaterThan(0)
    expect(sim.state.countdown).toBeLessThanOrEqual(8)
    const second = run(sim, 20)
    const won = ofKind(second, 'won')
    expect(won).toHaveLength(1)
    expect(won[0]?.stars).toBe(3)
    // rewards 12 + bonuses 28 + 36 + 3 stars × 500
    expect(sim.state.score).toBe(12 + 28 + 36 + 1500)
    expect(sim.state.phase).toBe('won')
    // early start on wave 1 only (wave 2 auto-started): + 2 × 12
    expect(sim.state.gold).toBe(500 - 140 + 24 + 12 + 28 + 36)
  })

  it('gives two stars when at most three lives are lost', () => {
    const sim = simOf(LANE, { waves: [wave([group('pawn', 2)]), wave([group('pawn', 1)])] })
    sim.startWave()
    const leaks = ofKind(run(sim, 12), 'leak')
    expect(leaks).toHaveLength(2)
    expect(sim.state.lives).toBe(18)
    sim.build({ c: 3, r: 1 }, 'rook')
    const won = ofKind(run(sim, 20), 'won')
    expect(won[0]?.stars).toBe(2)
  })

  it('loses when lives run out', () => {
    const sim = simOf(LANE, { lives: 2, waves: [wave([group('pawn', 3)])] })
    sim.startWave()
    const events = run(sim, 12)
    expect(ofKind(events, 'lost')).toEqual([{ kind: 'lost', wave: 1, score: 0 }])
    expect(sim.state.phase).toBe('lost')
    expect(sim.state.lives).toBe(0)
  })
})

describe('endless', () => {
  it('pulls waves from the generator forever and scores waves × 100 + rewards', () => {
    const generator = (n: number) => wave([group('pawn', 1)], { hpMult: 1 + 0.12 * n })
    const sim = createSim({ map: mapOf(LANE), seed: 1, unlockedSpells: [], endless: true, waveGenerator: generator })
    expect(sim.state.waveTotal).toBe(0)
    sim.build({ c: 3, r: 1 }, 'rook')
    sim.build({ c: 5, r: 1 }, 'rook')
    for (let i = 0; i < 3; i++) {
      sim.startWave()
      run(sim, 10)
    }
    expect(sim.state.wave).toBe(3)
    expect(sim.state.phase).toBe('build')
    expect(sim.state.kills).toBe(3)
    expect(sim.state.score).toBe(3 * 100 + 18)
    const e = ofKind(sim.tick(0), 'won')
    expect(e).toHaveLength(0)
  })
})
