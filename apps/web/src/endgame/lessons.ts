// Endgame lesson catalogue (P2.K Slice 1).
//
// Each lesson is a starting FEN + a goal description. The trainer
// runs the position with the player as White and Stockfish as Black
// (hard difficulty, so the defender plays optimally). The lesson is
// cleared when the player checkmates the lone king.
//
// More positions per lesson, plus the K+P vs K opposition family,
// arrive in Slice 2 once we have a hint system to scaffold the
// trickier theoretical lines.

export interface Lesson {
  id: string
  title: string
  pieceSummary: string
  goal: string
  technique: string
  /** Starting position. White to move; player plays White. */
  startFen: string
  /** Soft target — used in flavour copy. The engine determines mate
   *  via chess.js status, not by counting plies. */
  parMoves: number
}

export const LESSONS: Lesson[] = [
  {
    id: 'kqk',
    title: 'Queen + King mate',
    pieceSummary: 'K + Q  vs  K',
    goal: 'Drive the black king into a corner and deliver mate.',
    technique:
      'Keep the queen a knight\'s-move away from the black king to box it in, then march your king up to support the final mating square.',
    startFen: '8/8/4k3/8/8/4K3/4Q3/8 w - - 0 1',
    parMoves: 10,
  },
  {
    id: 'krk',
    title: 'Rook + King mate',
    pieceSummary: 'K + R  vs  K',
    goal: 'Use the rook to cut the king off and walk it down to the edge.',
    technique:
      'Place the rook so the black king cannot cross a rank or file (the "ladder"). Step your own king in opposition; each turn shrinks the box.',
    startFen: '4k3/8/8/8/8/4K3/8/4R3 w - - 0 1',
    parMoves: 16,
  },
]

export function getLesson(id: string | undefined): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null
}
