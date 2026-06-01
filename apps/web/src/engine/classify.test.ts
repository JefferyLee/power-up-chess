import { describe, expect, it } from 'vitest'
import { classifyMove, cpLossFromMover } from './classify'

describe('cpLossFromMover', () => {
  it('white losing ground: positive loss', () => {
    // White was +50, dropped to +20 → lost 30.
    expect(
      cpLossFromMover({ evalBeforeWhite: 50, evalAfterWhite: 20, sideToMove: 'w', isBestMove: false }),
    ).toBe(30)
  })

  it('black losing ground: positive loss', () => {
    // White was -50 (black better by 50). After black moves, white is -20
    // (black only better by 20) → black lost 30 cp of advantage.
    expect(
      cpLossFromMover({ evalBeforeWhite: -50, evalAfterWhite: -20, sideToMove: 'b', isBestMove: false }),
    ).toBe(30)
  })

  it('improving the position clamps to 0 (no negative loss)', () => {
    expect(
      cpLossFromMover({ evalBeforeWhite: 0, evalAfterWhite: 50, sideToMove: 'w', isBestMove: false }),
    ).toBe(0)
  })
})

describe('classifyMove', () => {
  it('isBestMove always wins, regardless of cp delta', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -500, sideToMove: 'w', isBestMove: true }),
    ).toBe('best')
  })

  it('excellent: cp loss ≤ 10', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -10, sideToMove: 'w', isBestMove: false }),
    ).toBe('excellent')
  })

  it('good: cp loss 11–50', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -40, sideToMove: 'w', isBestMove: false }),
    ).toBe('good')
  })

  it('inaccuracy: cp loss 51–100', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -80, sideToMove: 'w', isBestMove: false }),
    ).toBe('inaccuracy')
  })

  it('mistake: cp loss 101–200', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -150, sideToMove: 'w', isBestMove: false }),
    ).toBe('mistake')
  })

  it('blunder: cp loss > 200', () => {
    expect(
      classifyMove({ evalBeforeWhite: 0, evalAfterWhite: -350, sideToMove: 'w', isBestMove: false }),
    ).toBe('blunder')
  })

  it('classification works symmetrically for black', () => {
    // Black starts at -100 (worse), drops to +200 (much worse) → blunder.
    expect(
      classifyMove({ evalBeforeWhite: -100, evalAfterWhite: 200, sideToMove: 'b', isBestMove: false }),
    ).toBe('blunder')
  })
})
