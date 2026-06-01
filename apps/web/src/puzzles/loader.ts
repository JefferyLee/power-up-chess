// Puzzle loader.
//
// MVP1 bundles all puzzles at build time — the catalogue is small
// (10 seed + ~200 Lichess once Phase 9 ships) so a few hundred KB in the
// main bundle is acceptable and saves us a network round-trip per puzzle.
// If the catalogue ever grows past ~1MB we can switch to dynamic imports
// per puzzle file behind the same API.

import seedJson from '@data/puzzles/seed.json'
import type { Puzzle, PuzzleMotif } from './types'

// Cast through unknown: JSON import gives a structural shape, we narrow it to
// our typed schema. Validation happens once at module load.
const SEED: Puzzle[] = seedJson as unknown as Puzzle[]

/** Every puzzle currently available to the app, in display order. */
export const ALL_PUZZLES: ReadonlyArray<Puzzle> = SEED

/** Quick map for O(1) lookup by id. */
const BY_ID = new Map<string, Puzzle>(ALL_PUZZLES.map((p) => [p.id, p]))

export function getPuzzle(id: string): Puzzle | null {
  return BY_ID.get(id) ?? null
}

/** Puzzles that include the given motif tag. */
export function puzzlesByMotif(motif: PuzzleMotif): Puzzle[] {
  return ALL_PUZZLES.filter((p) => p.motifs.includes(motif))
}

/** All motifs present in the current catalogue, in stable order of first
 *  appearance. Used by the Garden index page. */
export function listMotifs(): PuzzleMotif[] {
  const seen = new Set<PuzzleMotif>()
  for (const p of ALL_PUZZLES) {
    for (const m of p.motifs) seen.add(m)
  }
  return [...seen]
}

/** Sort a puzzle list ascending by difficulty — useful for the "easiest
 *  unsolved first" CTA. */
export function sortByDifficulty(puzzles: ReadonlyArray<Puzzle>): Puzzle[] {
  return [...puzzles].sort((a, b) => a.difficulty - b.difficulty)
}
