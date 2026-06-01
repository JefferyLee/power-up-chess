import { describe, expect, it } from 'vitest'
import { WizardChess } from './WizardChess'

const BARE = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'

describe('WizardChess — basics', () => {
  it('initial state', () => {
    const g = new WizardChess()
    expect(g.turn()).toBe('w')
    expect(g.legalDestinationsFrom('e7')).toEqual([])
  })

  it('a normal move toggles turn', () => {
    const g = new WizardChess()
    const rec = g.move({ from: 'e2', to: 'e4' })
    expect(rec).not.toBeNull()
    expect(g.turn()).toBe('b')
  })
})

describe('WizardChess — checkmate ends the game', () => {
  it("Fool's Mate triggers king_captured with black as winner", () => {
    const g = new WizardChess()
    expect(g.move({ from: 'f2', to: 'f3' })).not.toBeNull()
    expect(g.move({ from: 'e7', to: 'e5' })).not.toBeNull()
    expect(g.move({ from: 'g2', to: 'g4' })).not.toBeNull()
    expect(g.move({ from: 'd8', to: 'h4' })).not.toBeNull()
    const status = g.status()
    expect(status.kind).toBe('king_captured')
    if (status.kind === 'king_captured') expect(status.winner).toBe('b')
  })
})

describe('Freeze spell', () => {
  it('locks the target out of moves for 2 of its own turns', () => {
    const g = new WizardChess('4k1n1/8/8/8/8/8/8/3QK3 w - - 0 1')
    expect(g.castSpell('freeze', ['g8'])).not.toBeNull()
    expect(g.turn()).toBe('b')
    expect(g.legalDestinationsFrom('g8')).toEqual([])
    expect(g.move({ from: 'e8', to: 'e7' })).not.toBeNull()
    expect(g.move({ from: 'd1', to: 'd2' })).not.toBeNull()
    expect(g.legalDestinationsFrom('g8')).toEqual([])
    expect(g.move({ from: 'e7', to: 'e8' })).not.toBeNull()
    expect(g.move({ from: 'd2', to: 'd1' })).not.toBeNull()
    expect(g.legalDestinationsFrom('g8').length).toBeGreaterThan(0)
  })
})

describe('Confuse spell', () => {
  it('lets the piece move but blocks captures', () => {
    const g = new WizardChess('4k3/8/8/8/3P4/5n2/8/4K3 w - - 0 1')
    expect(g.castSpell('confuse', ['f3'])).not.toBeNull()
    const targets = g.legalDestinationsFrom('f3')
    expect(targets).not.toContain('d4')
    expect(targets.length).toBeGreaterThan(0)
  })
})

describe('Shield spell', () => {
  it('makes a friendly piece uncapturable', () => {
    const g = new WizardChess('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(g.castSpell('shield', ['a1'])).not.toBeNull()
    expect(g.legalDestinationsFrom('a8')).not.toContain('a1')
  })
})

describe('Teleport spell', () => {
  it('swaps two of your own pieces', () => {
    const g = new WizardChess('4k3/8/8/8/8/8/8/RB2K3 w - - 0 1')
    expect(g.castSpell('teleport', ['a1', 'b1'])).not.toBeNull()
    expect(g.pieceAt('a1')?.type).toBe('b')
    expect(g.pieceAt('b1')?.type).toBe('r')
  })

  it('rejects swapping with an enemy piece', () => {
    const g = new WizardChess('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(g.castSpell('teleport', ['a1', 'a8'])).toBeNull()
  })
})

describe('Phantom spell', () => {
  it('lets a slider pass through its own piece for one turn', () => {
    const g = new WizardChess('4k3/8/8/8/8/8/P7/R3K3 w - - 0 1')
    expect(g.legalDestinationsFrom('a1')).not.toContain('a3')
    expect(g.castSpell('phantom', ['a1'])).not.toBeNull()
    expect(g.move({ from: 'e8', to: 'e7' })).not.toBeNull()
    expect(g.turn()).toBe('w')
    expect(g.legalDestinationsFrom('a1')).toContain('a3')
  })
})

describe('Summon Pawn spell', () => {
  it("drops a new pawn in the caster's own half on an empty square", () => {
    const g = new WizardChess(BARE)
    expect(g.castSpell('summon', ['d3'])).not.toBeNull()
    expect(g.pieceAt('d3')).toEqual({ type: 'p', color: 'w' })
  })

  it("rejects summoning onto the opponent's half", () => {
    const g = new WizardChess(BARE)
    expect(g.castSpell('summon', ['d6'])).toBeNull()
  })

  it('rejects summoning onto an occupied square', () => {
    const g = new WizardChess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(g.castSpell('summon', ['a1'])).toBeNull()
  })
})

describe('Serialisation', () => {
  it('round-trips through toState/fromState', () => {
    const g = new WizardChess()
    g.move({ from: 'e2', to: 'e4' })
    g.move({ from: 'e7', to: 'e5' })
    const s = g.toState()
    const g2 = WizardChess.fromState(s)
    expect(g2.fen()).toBe(g.fen())
    expect(g2.turn()).toBe(g.turn())
  })

  it('preserves active effects across a round-trip', () => {
    const g = new WizardChess('4k1n1/8/8/8/8/8/8/3QK3 w - - 0 1')
    g.castSpell('freeze', ['g8'])
    const s = g.toState()
    const g2 = WizardChess.fromState(s)
    expect(g2.effectsAt('g8').some((e) => e.kind === 'freeze')).toBe(true)
  })
})
