// Puzzle loader.
//
// Bundles the Lichess CC0 sample at build time. The early hand-curated
// seed set was removed in MVP2.H.1 (had a few authoring errors that
// would fail validation); Lichess content is already engine-validated.

import lichessJson from '@data/puzzles/lichess.json'
import type { Puzzle, PuzzleMotif } from './types'

const LICHESS: Puzzle[] = lichessJson as unknown as Puzzle[]

/** Every puzzle currently available to the app. */
export const ALL_PUZZLES: ReadonlyArray<Puzzle> = LICHESS

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
