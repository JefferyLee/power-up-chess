import { describe, expect, it } from 'vitest'
import { scorePuzzle, starLabel } from './scoring'

describe('scorePuzzle', () => {
  it('perfect solve: 25 points + 3 stars', () => {
    const r = scorePuzzle({ timeMs: 10_000, wrongMoves: 0, hintsUsed: 0 })
    expect(r.points).toBe(25)
    expect(r.stars).toBe(3)
    expect(r.breakdown).toEqual({ base: 10, speed: 5, firstTry: 5, noHints: 5 })
  })

  it('solid solve under 30s with one hint, no mistakes: 2 stars', () => {
    const r = scorePuzzle({ timeMs: 25_000, wrongMoves: 0, hintsUsed: 1 })
    expect(r.stars).toBe(2)
    expect(r.points).toBe(10 + 3 + 5 + 2) // 20
  })

  it('struggling but solved: 1 star, still positive', () => {
    const r = scorePuzzle({ timeMs: 90_000, wrongMoves: 3, hintsUsed: 3 })
    expect(r.stars).toBe(1)
    expect(r.points).toBe(10) // base only
  })

  it('3 stars require ALL of: 0 wrong, 0 hints, ≤30s', () => {
    expect(scorePuzzle({ timeMs: 30_001, wrongMoves: 0, hintsUsed: 0 }).stars).toBe(2)
    expect(scorePuzzle({ timeMs: 5_000, wrongMoves: 1, hintsUsed: 0 }).stars).toBe(2)
    expect(scorePuzzle({ timeMs: 5_000, wrongMoves: 0, hintsUsed: 1 }).stars).toBe(2)
  })

  it('2 stars require ≤1 wrong AND ≤1 hint AND ≤60s', () => {
    expect(scorePuzzle({ timeMs: 60_001, wrongMoves: 0, hintsUsed: 0 }).stars).toBe(1)
    expect(scorePuzzle({ timeMs: 5_000, wrongMoves: 2, hintsUsed: 0 }).stars).toBe(1)
    expect(scorePuzzle({ timeMs: 5_000, wrongMoves: 0, hintsUsed: 2 }).stars).toBe(1)
  })

  it('every solve is at least 10 points (always positive feedback)', () => {
    expect(scorePuzzle({ timeMs: 10 * 60_000, wrongMoves: 99, hintsUsed: 99 }).points).toBe(10)
  })

  it.each([1, 2, 3] as const)('starLabel(%i) is non-empty', (s) => {
    expect(starLabel(s).length).toBeGreaterThan(0)
  })
})
