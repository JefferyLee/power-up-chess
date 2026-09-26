import { describe, expect, it } from 'vitest'
import { LANE, OPEN, ofKind, simOf } from './fixtures'

describe('build', () => {
  it('charges the piece cost and records what was spent', () => {
    const sim = simOf(LANE)
    const events = (sim.build({ c: 2, r: 1 }, 'pawn'), sim.tick(0))
    expect(sim.state.gold).toBe(460)
    const t = sim.towerAt({ c: 2, r: 1 })
    expect(t?.level).toBe(1)
    expect(t?.spent).toBe(40)
    expect(ofKind(events, 'build')).toHaveLength(1)
  })

  it('explains every refusal', () => {
    const sim = simOf(LANE, { startGold: 200 })
    expect(sim.canBuild({ c: 0, r: 2 }, 'pawn').reason).toBe('not buildable')
    expect(sim.canBuild({ c: 99, r: 2 }, 'pawn').reason).toBe('not buildable')
    sim.build({ c: 1, r: 1 }, 'pawn')
    expect(sim.canBuild({ c: 1, r: 1 }, 'pawn').reason).toBe('occupied')
    expect(sim.canBuild({ c: 2, r: 1 }, 'queen').reason).toBe('not enough gold')
    expect(sim.build({ c: 3, r: 1 }, 'king')).toBe(false) // 160 gold left < 180
    const rich = simOf(LANE, { startGold: 1000 })
    expect(rich.build({ c: 3, r: 1 }, 'king')).toBe(true)
    expect(rich.canBuild({ c: 4, r: 1 }, 'king').reason).toBe('only one king')
    expect(simOf(LANE, { modifiers: ['noQueens'] }).canBuild({ c: 4, r: 1 }, 'queen').reason).toBe('queens are banned here')
    expect(simOf(LANE, { modifiers: ['noKing'] }).canBuild({ c: 4, r: 1 }, 'king').reason).toBe('no king on this map')
    const open = simOf(OPEN, { startGold: 5000 })
    open.build({ c: 2, r: 1 }, 'pawn')
    expect(open.canBuild({ c: 1, r: 2 }, 'pawn').reason).toBe('blocked path')
  })

  it('maxTowers8 caps the board at eight pieces', () => {
    const sim = simOf(LANE, { startGold: 5000, modifiers: ['maxTowers8'] })
    for (let c = 0; c < 8; c++) expect(sim.build({ c, r: 1 }, 'pawn')).toBe(true)
    expect(sim.canBuild({ c: 0, r: 3 }, 'pawn')).toEqual({ ok: false, reason: 'tower limit' })
  })

  it('lowBudget starts with 70 gold', () => {
    expect(simOf(LANE, { modifiers: ['lowBudget'] }).state.gold).toBe(70)
  })
})

describe('upgrade, branch, promote, sell', () => {
  it('walks a pawn to Spear and sells it for 60 % of everything spent', () => {
    const sim = simOf(LANE)
    sim.build({ c: 2, r: 1 }, 'pawn')
    const t = sim.towerAt({ c: 2, r: 1 })
    if (!t) throw new Error('no tower')
    expect(sim.canUpgrade(t.id)).toEqual({ ok: true, cost: 35 })
    expect(sim.upgrade(t.id)).toBe(true)
    expect(t.level).toBe(2)
    expect(sim.canUpgrade(t.id)).toMatchObject({ ok: false, reason: 'choose a branch', cost: 60 })
    expect(sim.upgrade(t.id)).toBe(false)
    expect(sim.chooseBranch(t.id, 'nope')).toBe(false)
    expect(sim.chooseBranch(t.id, 'spear')).toBe(true)
    expect(t.level).toBe(3)
    expect(t.branch).toBe('spear')
    expect(t.spent).toBe(40 + 35 + 60)
    expect(sim.state.gold).toBe(500 - 135)
    expect(sim.canUpgrade(t.id).reason).toBe('max level')
    expect(sim.sell(t.id)).toBe(Math.floor(135 * 0.6))
    expect(sim.state.gold).toBe(500 - 135 + 81)
    expect(sim.towerAt({ c: 2, r: 1 })).toBeNull()
  })

  it('promotes a pawn for cost(piece) − 40 and resets its level', () => {
    const sim = simOf(LANE)
    sim.build({ c: 2, r: 1 }, 'pawn')
    const t = sim.towerAt({ c: 2, r: 1 })
    if (!t) throw new Error('no tower')
    sim.upgrade(t.id)
    expect(sim.canPromote(t.id, 'queen')).toEqual({ ok: true, cost: 220 })
    expect(sim.promote(t.id, 'queen')).toBe(true)
    expect(t.type).toBe('queen')
    expect(t.level).toBe(1)
    expect(t.spent).toBe(40 + 35 + 220)
    expect(sim.state.gold).toBe(500 - 40 - 35 - 220)
    expect(sim.canPromote(t.id, 'rook').reason).toBe('only pawns promote')
  })

  it('keeps the king unique through promotion too', () => {
    const sim = simOf(LANE, { startGold: 1000 })
    sim.build({ c: 1, r: 1 }, 'king')
    sim.build({ c: 3, r: 1 }, 'pawn')
    const pawn = sim.towerAt({ c: 3, r: 1 })
    if (!pawn) throw new Error('no tower')
    expect(sim.canPromote(pawn.id, 'king').reason).toBe('only one king')
    expect(sim.promote(pawn.id, 'king')).toBe(false)
  })

  it('a king buffs its eight neighbours and nobody else', () => {
    const sim = simOf(LANE, { startGold: 1000 })
    sim.build({ c: 3, r: 1 }, 'king')
    sim.build({ c: 4, r: 1 }, 'pawn')
    sim.build({ c: 6, r: 1 }, 'pawn')
    expect(sim.towerAt({ c: 4, r: 1 })?.buffed).toBe(true)
    expect(sim.towerAt({ c: 6, r: 1 })?.buffed).toBe(false)
    expect(sim.towerAt({ c: 3, r: 1 })?.buffed).toBe(false)
  })
})
