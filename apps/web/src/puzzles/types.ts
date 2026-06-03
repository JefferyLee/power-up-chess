// Puzzle types — shared between the seed JSON, the Lichess pipeline output,
// and the UI/loader. Keep this in sync with the schema in
// data/puzzles/seed.json and the future data/puzzles/lichess/*.json.

import type { Color } from '../chess/types'

export type PuzzleMotif =
  | 'mateIn1'
  | 'mateIn2'
  | 'backRankMate'
  | 'fork'
  | 'knightFork'
  | 'pawnFork'
  | 'royalFork'
  | 'pin'
  | 'absolutePin'
  | 'skewer'
  | 'hangingPiece'
  | 'discoveredAttack'
  | string // permissive: Lichess emits many themes we don't categorise yet

export interface PuzzleSource {
  provider: 'seed' | 'lichess'
  /** Original id at the provider, when applicable. */
  puzzleId?: string
  /** Licence string. 'puc-mvp1' for hand-curated, 'CC0' for Lichess, etc. */
  license: string
}

export interface Puzzle {
  /** Globally unique id. seed-NNN for hand-curated; lichess:<id> for imports. */
  id: string
  fen: string
  sideToMove: Color
  /** Solution as a UCI sequence. For one-move puzzles, length 1. */
  solution: string[]
  /** Mirror of the solution in SAN, for debugging and templated copy. */
  san?: string[]
  motifs: PuzzleMotif[]
  /** Lichess-style rating; used for sorting and progress curves. */
  difficulty: number
  source: PuzzleSource
  /** 1–2 sentence child-friendly explanation in default-host voice. */
  explanation: string
  /** Three-rung hint ladder: gentle direction → tactical clue → near-solution.
   *  Each one consumed costs the player a reward bonus. Optional —
   *  the bulk lichess catalogue is imported without hand-written
   *  hints; only the legacy seed set had them. */
  hints?: [string, string, string]
}
