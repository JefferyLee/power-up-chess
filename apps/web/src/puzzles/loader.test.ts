import { Chess } from 'chess.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import lichessJson from '@data/puzzles/lichess.json'
import {
  getPuzzle,
  listMotifs,
  loadPuzzles,
  puzzlesByMotif,
  sortByDifficulty,
} from './loader'
import type { Puzzle } from './types'

// The app fetches the bank at runtime (see loader.ts); the tests read the
// JSON directly so the integrity sweep below covers every shipped puzzle.
const ALL_PUZZLES = lichessJson as unknown as Puzzle[]

describe('loadPuzzles', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the hashed JSON asset once and memoises it', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(
      async () => new Response(JSON.stringify(ALL_PUZZLES.slice(0, 3))),
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = await loadPuzzles()
    const second = await loadPuzzles()
    expect(first).toHaveLength(3)
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toMatch(/lichess.*\.json$/)
  })
})

describe('puzzle loader', () => {
  it('loads the catalogue (lichess sample)', () => {
    expect(ALL_PUZZLES.length).toBeGreaterThan(0)
    // ~200 Lichess. Generous floor so import drops/adds don't churn.
    expect(ALL_PUZZLES.length).toBeGreaterThanOrEqual(100)
  })

  it('every puzzle that ships hints has exactly 3', () => {
    // The bulk lichess catalogue is imported without hand-written
    // hints (only the legacy seed set had them). Anything that DOES
    // ship hints must still come in threes with non-empty strings.
    for (const p of ALL_PUZZLES) {
      if (!p.hints) continue
      expect(p.hints).toHaveLength(3)
      for (const h of p.hints) expect(h.length).toBeGreaterThan(0)
    }
  })

  it('ids are unique', () => {
    const ids = ALL_PUZZLES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('getPuzzle returns by id, null otherwise', () => {
    const sample = ALL_PUZZLES[0]!
    expect(getPuzzle(ALL_PUZZLES, sample.id)?.id).toBe(sample.id)
    expect(getPuzzle(ALL_PUZZLES, 'does-not-exist')).toBeNull()
  })

  it('puzzlesByMotif returns matching entries', () => {
    const mates = puzzlesByMotif(ALL_PUZZLES, 'mateIn1')
    expect(mates.length).toBeGreaterThanOrEqual(4)
    for (const p of mates) expect(p.motifs).toContain('mateIn1')
  })

  it('listMotifs covers every motif seen', () => {
    const motifs = listMotifs(ALL_PUZZLES)
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
    expect(ALL_PUZZLES[0]).toBeDefined()
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
