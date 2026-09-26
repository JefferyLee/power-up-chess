import { describe, expect, it } from 'vitest'
import { END, LANE, group, mapOf, ofKind, park, run, simOf, spawnNow, wave } from './fixtures'
import { createSim } from './sim'

const sorted = (cells: { c: number; r: number }[]) =>
  [...cells].sort((a, b) => a.r - b.r || a.c - b.c).map((x) => `${x.c},${x.r}`)

describe('attackCells', () => {
  const sim = simOf(LANE)

  it('pawn hits its four diagonals, clipped to the board', () => {
    expect(sorted(sim.attackCells('pawn', { c: 3, r: 2 }, 1, null))).toEqual(['2,1', '4,1', '2,3', '4,3'])
    expect(sorted(sim.attackCells('pawn', { c: 0, r: 0 }, 1, null))).toEqual(['1,1'])
  })

  it('knight covers the eight L-cells', () => {
    expect(sorted(sim.attackCells('knight', { c: 3, r: 2 }, 1, null))).toEqual([
      '2,0', '4,0', '1,1', '5,1', '1,3', '5,3', '2,4', '4,4',
    ])
  })

  it('rook lines run their full length and stop at the edge; L2 is longer', () => {
    expect(sim.attackCells('rook', { c: 0, r: 2 }, 1, null)).toHaveLength(5 + 2 + 2)
    expect(sim.attackCells('rook', { c: 0, r: 2 }, 2, null)).toHaveLength(6 + 2 + 2)
  })

  it('Spear pawn adds the four orthogonals', () => {
    expect(sim.attackCells('pawn', { c: 3, r: 2 }, 3, 'spear')).toHaveLength(8)
    expect(sim.attackCells('pawn', { c: 3, r: 2 }, 3, 'phalanx')).toHaveLength(4)
  })

  it('king aura shows its eight neighbours', () => {
    expect(sim.attackCells('king', { c: 3, r: 2 }, 1, null)).toHaveLength(8)
  })

  it('fog trims one cell off every line', () => {
    const foggy = simOf(LANE, { modifiers: ['fog'] })
    expect(foggy.attackCells('rook', { c: 0, r: 2 }, 1, null)).toHaveLength(4 + 2 + 2)
    expect(foggy.attackCells('pawn', { c: 3, r: 2 }, 1, null)).toHaveLength(4)
  })
})

describe('line blocking', () => {
  it('a rook hits only the first occupied cell along its line', () => {
    const sim = createSim({ map: mapOf(END, { waves: [wave([group('pawn', 2)])] }), seed: 1, unlockedSpells: [] })
    spawnNow(sim)
    const [near, far] = sim.state.enemies
    if (!near || !far) throw new Error('expected two pawns')
    park(near, 3, 0, 3)
    park(far, 2, 0, 2)
    expect(sim.build({ c: 5, r: 0 }, 'rook')).toBe(true)
    const hits = ofKind(sim.tick(1 / 20), 'hit')
    expect(hits.map((h) => h.enemyId)).toEqual([near.id])
    expect(far.hp).toBe(60)
    expect(sim.state.beams.map((b) => b.kind)).toEqual(['rook'])
  })

  it('inside the first occupied cell the enemy furthest along is hit', () => {
    const sim = createSim({ map: mapOf(END, { waves: [wave([group('pawn', 2)])] }), seed: 1, unlockedSpells: [] })
    spawnNow(sim)
    const [a, b] = sim.state.enemies
    if (!a || !b) throw new Error('expected two pawns')
    park(a, 3, 0, 3.1)
    park(b, 3, 0, 3.4)
    sim.build({ c: 5, r: 0 }, 'rook')
    const hits = ofKind(sim.tick(1 / 20), 'hit')
    expect(hits.map((h) => h.enemyId)).toEqual([b.id])
  })

  it('cells towers pick by targeting mode', () => {
    const sim = createSim({ map: mapOf(LANE, { waves: [wave([group('pawn', 2)])] }), seed: 1, unlockedSpells: [] })
    sim.build({ c: 3, r: 1 }, 'pawn')
    spawnNow(sim)
    const [a, b] = sim.state.enemies
    if (!a || !b) throw new Error('expected two pawns')
    park(a, 2, 2, 2)
    park(b, 4, 2, 4)
    b.hp = 30
    const tower = sim.towerAt({ c: 3, r: 1 })
    if (!tower) throw new Error('no tower')
    expect(ofKind(sim.tick(1 / 20), 'hit').map((h) => h.enemyId)).toEqual([b.id]) // first = max progress
    sim.setTargeting(tower.id, 'last')
    expect(ofKind(run(sim, 1), 'hit').map((h) => h.enemyId)).toContain(a.id)
    expect(sim.state.projectiles.every((p) => p.kind === 'arrow')).toBe(true)
  })
})
