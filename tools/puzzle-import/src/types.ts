// Shared types for the puzzle-import pipeline.

export interface LichessRow {
  puzzleId: string
  fen: string         // FEN BEFORE the opponent's setup move
  moves: string[]     // [opponentSetup, ourMove, opponentReply?, ourReply?, ...]
  rating: number
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
  difficulty: number
  source: {
    provider: 'lichess'
    puzzleId: string
    license: 'CC0'
  }
  explanation: string
  hints: [string, string, string]
}

export interface FilteredEntry {
  puzzleId: string
  fenAfterSetup: string
  sideToMove: 'w' | 'b'
  solution: string[]
  themes: string[]
  rating: number
  popularity: number
  /** Primary motif we sampled by — used for stratified sample bookkeeping. */
  primaryMotif: string
}
