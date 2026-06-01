import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  ALL_PUZZLES,
  getPuzzle,
  listMotifs,
  puzzlesByMotif,
  sortByDifficulty,
} from './loader'

describe('puzzle loader', () => {
  it('loads the catalogue (seed + lichess)', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThan(0)
    // 10 seed + ~200 lichess. Generous floor so a handful of import
    // drops/adds doesn't churn the test.
    expect(ALL_PUZZLES.length).toBeGreaterThanOrEqual(100)
  })

  it('every puzzle has exactly 3 hints', () => {
    for (const p of ALL_PUZZLES) {
      expect(p.hints).toHaveLength(3)
      for (const h of p.hints) expect(h.length).toBeGreaterThan(0)
    }
  })

  it('ids are unique', () => {
    const ids = ALL_PUZZLES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getPuzzle returns by id, null otherwise', () => {
    expect(getPuzzle('seed-001')?.id).toBe('seed-001')
    expect(getPuzzle('does-not-exist')).toBeNull()
  })

  it('puzzlesByMotif returns matching entries', () => {
    const mates = puzzlesByMotif('mateIn1')
    expect(mates.length).toBeGreaterThanOrEqual(4)
    for (const p of mates) expect(p.motifs).toContain('mateIn1')
  })

  it('listMotifs covers every motif seen', () => {
    const motifs = listMotifs()
    expect(motifs).toContain('mateIn1')
    expect(motifs).toContain('fork')
    expect(motifs).toContain('pin')
    expect(motifs).toContain('hangingPiece')
  })

  it('sortByDifficulty is ascending and non-destructive', () => {
    const easiest = sortByDifficulty(ALL_PUZZLES)
    for (let i = 1; i < easiest.length; i++) {
      expect(easiest[i]!.difficulty).toBeGreaterThanOrEqual(easiest[i - 1]!.difficulty)
    }
    // Original order preserved (loader returns a Readonly tuple; sortByDifficulty copies).
    expect(ALL_PUZZLES[0]!.id).toBe('seed-001')
  })
})

describe('puzzle integrity (chess.js)', () => {
  it.each(ALL_PUZZLES.map((p) => [p.id, p] as const))(
    '%s: FEN is legal, side-to-move matches, solution plays out, mate claims hold',
    (_id, p) => {
      const g = new Chess(p.fen)
      expect(g.turn()).toBe(p.sideToMove)
      expect(g.isGameOver()).toBe(false)

      let last
      for (const uci of p.solution) {
        last = g.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
        })
        expect(last).not.toBeNull()
      }
      if (p.san?.[p.solution.length - 1]) {
        expect(last!.san).toBe(p.san[p.solution.length - 1])
      }
      if (p.motifs.includes('mateIn1') || p.motifs.includes('mateIn2')) {
        expect(g.isCheckmate()).toBe(true)
      }
    },
  )
})
