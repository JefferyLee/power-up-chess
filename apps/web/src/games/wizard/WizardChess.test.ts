import { describe, expect, it } from 'vitest'
import { WizardChess } from './WizardChess'

// Bare two-king positions for targeted tests. White king e1, black king e8.
const BARE = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'
// White to move; white queen on d1, black queen on d8.
const QUEEN_FACEOFF = '3qk3/8/8/8/8/8/8/3QK3 w - - 0 1'

describe('WizardChess — basics', () => {
  it('initial mana is 0 / 0', () => {
    const g = new WizardChess()
    expect(g.mana()).toEqual({ w: 0, b: 0 })
  })

  it('a normal move earns +1 mana for the mover and toggles turn', () => {
    const g = new WizardChess()
    const rec = g.move({ from: 'e2', to: 'e4' })
    expect(rec).not.toBeNull()
    expect(g.mana()).toEqual({ w: 1, b: 0 })
    expect(g.turn()).toBe('b')
  })

  it('captures award piece-value mana (queen capture = +9 + 1)', () => {
    const g = new WizardChess(QUEEN_FACEOFF)
    const rec = g.move({ from: 'd1', to: 'd8' })
    expect(rec).not.toBeNull()
    expect(g.mana()).toEqual({ w: 10, b: 0 })
  })

  it('legalDestinationsFrom returns [] for opponent pieces', () => {
    const g = new WizardChess()
    expect(g.legalDestinationsFrom('e7')).toEqual([])
  })
})

describe('WizardChess — game end (V1 uses chess.js checkmate)', () => {
  it("Fool's Mate triggers king_captured with black as winner", () => {
    const g = new WizardChess()
    expect(g.move({ from: 'f2', to: 'f3' })).not.toBeNull()
    expect(g.move({ from: 'e7', to: 'e5' })).not.toBeNull()
    expect(g.move({ from: 'g2', to: 'g4' })).not.toBeNull()
    expect(g.move({ from: 'd8', to: 'h4' })).not.toBeNull()
    const status = g.status()
    expect(status.kind).toBe('king_captured')
    if (status.kind === 'king_captured') {
      expect(status.winner).toBe('b')
    }
  })
})

describe('Freeze spell', () => {
  it('locks the target out of moves for 2 of its own turns then expires', () => {
    // White Q d1, black knight g8, two kings. White to move.
    const g = new WizardChess('4k1n1/8/8/8/8/8/8/3QK3 w - - 0 1')
    g._setManaForTesting(4, 0)

    // White casts freeze on the black knight.
    expect(g.castSpell('freeze', ['g8'])).not.toBeNull()
    expect(g.turn()).toBe('b')

    // Black's 1st turn — knight frozen.
    expect(g.legalDestinationsFrom('g8')).toEqual([])
    // Black plays the king instead.
    expect(g.move({ from: 'e8', to: 'e7' })).not.toBeNull()
    // White plays something.
    expect(g.move({ from: 'd1', to: 'd2' })).not.toBeNull()

    // Black's 2nd turn — knight STILL frozen.
    expect(g.legalDestinationsFrom('g8')).toEqual([])
    expect(g.move({ from: 'e7', to: 'e8' })).not.toBeNull()
    expect(g.move({ from: 'd2', to: 'd1' })).not.toBeNull()

    // Black's 3rd turn — knight UNfrozen.
    expect(g.legalDestinationsFrom('g8').length).toBeGreaterThan(0)
  })
})

describe('Confuse spell', () => {
  it('lets the piece move but blocks captures', () => {
    // Black knight f3 with capturable white pawn at d4 (Nxd4 is legal pre-spell).
    const g = new WizardChess('4k3/8/8/8/3P4/5n2/8/4K3 w - - 0 1')
    g._setManaForTesting(3, 0)

    // White confuses the black knight.
    expect(g.castSpell('confuse', ['f3'])).not.toBeNull()

    // Black's turn — knight should still have *some* moves to empty
    // squares, but Nxd4 (capture) must not appear.
    const targets = g.legalDestinationsFrom('f3')
    expect(targets).not.toContain('d4')
    expect(targets.length).toBeGreaterThan(0)
  })
})

describe('Shield spell', () => {
  it('makes a friendly piece uncapturable', () => {
    // White rook a1, black rook a8. With shield on a1, black can't take.
    const g = new WizardChess('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    g._setManaForTesting(5, 0)
    expect(g.castSpell('shield', ['a1'])).not.toBeNull()
    // Now it's black's turn — black rook on a8 should NOT have a1 reachable.
    const blackRookTargets = g.legalDestinationsFrom('a8')
    expect(blackRookTargets).not.toContain('a1')
  })
})

describe('Teleport spell', () => {
  it('swaps two of your own pieces', () => {
    const g = new WizardChess('4k3/8/8/8/8/8/8/RB2K3 w - - 0 1')
    g._setManaForTesting(6, 0)
    expect(g.castSpell('teleport', ['a1', 'b1'])).not.toBeNull()
    expect(g.pieceAt('a1')?.type).toBe('b')
    expect(g.pieceAt('b1')?.type).toBe('r')
  })

  it('rejects swapping with an enemy piece', () => {
    const g = new WizardChess('r3k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    g._setManaForTesting(6, 0)
    expect(g.castSpell('teleport', ['a1', 'a8'])).toBeNull()
  })
})

describe('Phantom spell', () => {
  it('lets a slider pass through its own piece for one turn', () => {
    // White rook a1, white pawn a2 blocking. Without phantom, the rook
    // can't reach a3.
    const g = new WizardChess('4k3/8/8/8/8/8/P7/R3K3 w - - 0 1')
    expect(g.legalDestinationsFrom('a1')).not.toContain('a3')
    g._setManaForTesting(7, 0)
    expect(g.castSpell('phantom', ['a1'])).not.toBeNull()
    // It's black's turn now. Black makes any move.
    expect(g.move({ from: 'e8', to: 'e7' })).not.toBeNull()
    // White's turn — rook with phantom should now have a3 reachable.
    expect(g.turn()).toBe('w')
    expect(g.legalDestinationsFrom('a1')).toContain('a3')
  })
})

describe('Summon Pawn spell', () => {
  it('drops a new pawn in the caster\'s own half on an empty square', () => {
    const g = new WizardChess(BARE)
    g._setManaForTesting(8, 0)
    expect(g.castSpell('summon', ['d3'])).not.toBeNull()
    expect(g.pieceAt('d3')).toEqual({ type: 'p', color: 'w' })
  })

  it("rejects summoning onto the opponent's half", () => {
    const g = new WizardChess(BARE)
    g._setManaForTesting(8, 0)
    expect(g.castSpell('summon', ['d6'])).toBeNull()
  })

  it('rejects summoning onto an occupied square', () => {
    const g = new WizardChess('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    g._setManaForTesting(8, 0)
    expect(g.castSpell('summon', ['a1'])).toBeNull()
  })
})

describe('canCastSpell + validTargetsFor', () => {
  it('canCastSpell is false when mana is insufficient', () => {
    const g = new WizardChess()
    expect(g.canCastSpell('freeze')).toBe(false)
  })

  it('validTargetsFor returns enemy pieces for freeze', () => {
    const g = new WizardChess()
    const targets = g.validTargetsFor('freeze')
    expect(targets).toHaveLength(16)
    for (const sq of targets) {
      expect(g.pieceAt(sq)?.color).toBe('b')
    }
  })

  it('castSpell deducts mana and counts as the caster\'s turn', () => {
    const g = new WizardChess(BARE)
    g._setManaForTesting(8, 0)
    expect(g.turn()).toBe('w')
    expect(g.castSpell('summon', ['d3'])).not.toBeNull()
    expect(g.mana().w).toBe(0)
    expect(g.turn()).toBe('b')
  })
})
