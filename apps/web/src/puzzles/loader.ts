// Puzzle loader.
//
// The Lichess CC0 sample (data/puzzles/lichess.json, ~2.6 MB) is served as a
// content-hashed static asset and fetched on first use — it used to be
// inlined as a 1.8 MB JS chunk that the service worker precached for every
// visitor. The SW keeps it cache-first (vite.config.ts → puc-puzzles), so
// once fetched it is available offline; a new build changes the hash, which
// is what invalidates the old copy. The early hand-curated seed set was
// removed in MVP2.H.1; Lichess content is already engine-validated.

import lichessUrl from '@data/puzzles/lichess.json?url'
import type { Puzzle, PuzzleMotif } from './types'

let catalogue: Promise<ReadonlyArray<Puzzle>> | null = null

/** Every puzzle currently available to the app. Fetched once, then memoised;
 *  a failed fetch is forgotten so the next call retries. */
export function loadPuzzles(): Promise<ReadonlyArray<Puzzle>> {
  catalogue ??= fetch(lichessUrl)
    .then(async (res) => {
      if (!res.ok) throw new Error(`puzzle bank: HTTP ${res.status}`)
      return (await res.json()) as Puzzle[]
    })
    .catch((err: unknown) => {
      catalogue = null
      throw err
    })
  return catalogue
}

export function getPuzzle(puzzles: ReadonlyArray<Puzzle>, id: string): Puzzle | null {
  return puzzles.find((p) => p.id === id) ?? null
}

/** Puzzles that include the given motif tag. */
export function puzzlesByMotif(puzzles: ReadonlyArray<Puzzle>, motif: PuzzleMotif): Puzzle[] {
  return puzzles.filter((p) => p.motifs.includes(motif))
}

/** All motifs present in the catalogue, in stable order of first
 *  appearance. Used by the Garden index page. */
export function listMotifs(puzzles: ReadonlyArray<Puzzle>): PuzzleMotif[] {
  const seen = new Set<PuzzleMotif>()
  for (const p of puzzles) {
    for (const m of p.motifs) seen.add(m)
  }
  return [...seen]
}

/** Sort a puzzle list ascending by difficulty — useful for the "easiest
 *  unsolved first" CTA. */
export function sortByDifficulty(puzzles: ReadonlyArray<Puzzle>): Puzzle[] {
  return [...puzzles].sort((a, b) => a.difficulty - b.difficulty)
}
