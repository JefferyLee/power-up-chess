import { describe, expect, it } from 'vitest'
import { computeField, extractPath, index, parseMap, wouldBlock } from './path'
import { LANE, OPEN, mapOf, simOf } from './fixtures'

describe('parseMap', () => {
  it('numbers gates in reading order and finds the single goal', () => {
    const g = parseMap(mapOf(['S..G', '....', 'S...']))
    expect(g.gates).toEqual([{ c: 0, r: 0 }, { c: 0, r: 2 }])
    expect(g.goal).toEqual({ c: 3, r: 0 })
    expect(g.kinds[index(g, { c: 0, r: 0 })]).toBe('road')
  })

  it('rejects maps with zero or two goals', () => {
    expect(() => parseMap(mapOf(['S...']))).toThrow(/goal/)
    expect(() => parseMap(mapOf(['SG.G']))).toThrow(/goal/)
  })
})

describe('flow field', () => {
  it('counts cells to the goal and extracts the gate path', () => {
    const g = parseMap(mapOf(LANE))
    const f = computeField(g, new Set())
    expect(f.dist[index(g, { c: 0, r: 2 })]).toBe(7)
    expect(f.dist[index(g, { c: 3, r: 1 })]).toBe(-1) // plots are not walkable
    const path = extractPath(g, f, g.gates[0] ?? { c: 0, r: 0 })
    expect(path).toHaveLength(8)
    expect(path[0]).toEqual({ c: 0, r: 2 })
    expect(path[7]).toEqual({ c: 7, r: 2 })
  })

  it('refuses a placement that would strand a gate (block rule)', () => {
    const g = parseMap(mapOf(OPEN))
    // The gate's only exit is (1,1); with (2,1) taken, (1,2) is the last way out.
    const blocked = new Set([index(g, { c: 2, r: 1 })])
    expect(wouldBlock(g, blocked, { c: 3, r: 2 })).toBe(false)
    expect(wouldBlock(g, blocked, { c: 1, r: 2 })).toBe(true)
    expect(wouldBlock(g, blocked, { c: 1, r: 1 })).toBe(true)
  })

  it('reroutes the gate path after a tower lands on an open cell', () => {
    const sim = simOf(OPEN)
    const before = sim.state.paths[0] ?? []
    expect(before.length).toBeGreaterThan(0)
    const onPath = before[2] ?? { c: 0, r: 0 }
    expect(sim.build(onPath, 'pawn')).toBe(true)
    const after = sim.state.paths[0] ?? []
    expect(after.some((c) => c.c === onPath.c && c.r === onPath.r)).toBe(false)
    expect(after.at(-1)).toEqual({ c: 6, r: 3 })
  })

  it('reports blocked path through canBuild once the maze would close', () => {
    const sim = simOf(OPEN, { startGold: 5000 })
    expect(sim.build({ c: 2, r: 1 }, 'pawn')).toBe(true)
    expect(sim.canBuild({ c: 1, r: 2 }, 'pawn')).toEqual({ ok: false, reason: 'blocked path' })
    expect(sim.build({ c: 1, r: 2 }, 'pawn')).toBe(false)
  })
})
