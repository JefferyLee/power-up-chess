// Shared types for the puzzle-import pipeline.

/** The 6 plots in the Puzzle Garden — each filtered puzzle is tagged with one. */
export type Plot = 'mate' | 'fork' | 'pinSkewer' | 'sacrifice' | 'endgame' | 'defense'

export const PLOTS: Plot[] = ['mate', 'fork', 'pinSkewer', 'sacrifice', 'endgame', 'defense']

export interface LichessRow {
  puzzleId: string
  fen: string         // FEN BEFORE the opponent's setup move
  moves: string[]     // [opponentSetup, ourMove, opponentReply?, ourReply?, ...]
  rating: number
  ratingDeviation: number
  popularity: number
  themes: string[]
}

/** Output schema — matches apps/web/src/puzzles/types.ts Puzzle interface. */
export interface OutPuzzle {
  id: string
  fen: string         // FEN AFTER setup move; this is the puzzle starting position
  sideToMove: 'w' | 'b'
  solution: string[]  // UCI sequence the solver plays
  motifs: string[]
  plot: Plot
  difficulty: number
  ratingDeviation: number
  /** True for the 100-puzzle Legends Hall tier (rating ≥ 3000). */
  legends: boolean
  source: {
    provider: 'lichess'
    puzzleId: string
    license: 'CC0'
  }
  /** Optional editorial layer. Generated separately via the `explain` stage —
   *  most puzzles ship without explanations and the UI uses the engine's
   *  best line as feedback. */
  explanation?: string
  hints?: [string, string, string]
}

export interface FilteredEntry {
  puzzleId: string
  fenAfterSetup: string
  sideToMove: 'w' | 'b'
  solution: string[]
  themes: string[]
  rating: number
  ratingDeviation: number
  popularity: number
  /** Primary motif we sampled by — used for stratified sample bookkeeping
   *  and shown as the puzzle's main pattern label. */
  primaryMotif: string
  /** Which of the 6 garden plots this puzzle belongs to. */
  plot: Plot
}
