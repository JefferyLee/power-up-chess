// Endgame lesson catalogue (P2.K Slice 2).
//
// Each lesson is a *bag of positions* on the same technique. The
// trainer cycles through them — clearing one moves to the next, and
// the lesson is only "mastered" once all positions in the bag have
// been beaten. This keeps a single trip to the page from feeling
// like a one-shot demo.
//
// Positions are hand-picked to be clearly winning for White against
// best Black defence; Stockfish (hard tier) plays the lone king.

export interface LessonPosition {
  label: string
  /** White to move; player plays White. */
  fen: string
  /** Soft target — used in flavour copy. Engine still decides via
   *  chess.js status, not by counting plies. */
  parMoves: number
}

export interface Lesson {
  id: string
  title: string
  pieceSummary: string
  goal: string
  technique: string
  positions: LessonPosition[]
}

export const LESSONS: Lesson[] = [
  {
    id: 'kqk',
    title: 'Queen + King mate',
    pieceSummary: 'K + Q  vs  K',
    goal: 'Drive the black king into a corner and deliver mate.',
    technique:
      'Keep the queen a knight\'s-move away from the black king to box it in, then march your king up to support the final mating square. Beware stalemate when the king has no legal squares.',
    positions: [
      {
        label: 'Centre setup',
        fen: '8/8/4k3/8/8/4K3/4Q3/8 w - - 0 1',
        parMoves: 10,
      },
      {
        label: 'Long diagonal queen',
        fen: '8/3k4/8/8/8/8/3K4/Q7 w - - 0 1',
        parMoves: 12,
      },
      {
        label: 'Defender squeezed',
        fen: '8/8/8/4k3/8/8/4K3/Q7 w - - 0 1',
        parMoves: 13,
      },
    ],
  },
  {
    id: 'krk',
    title: 'Rook + King mate',
    pieceSummary: 'K + R  vs  K',
    goal: 'Use the rook to cut the king off and walk it down to the edge.',
    technique:
      'Place the rook so the black king cannot cross a rank or file (the "ladder"). Step your own king in opposition; each turn shrinks the box until the lone king is pinned on the back rank.',
    positions: [
      {
        label: 'Classic ladder',
        fen: '4k3/8/8/8/8/4K3/8/4R3 w - - 0 1',
        parMoves: 16,
      },
      {
        label: 'Rook on the corner file',
        fen: '4k3/8/8/8/4K3/8/8/R7 w - - 0 1',
        parMoves: 18,
      },
      {
        label: 'King a step off',
        fen: '4k3/8/8/8/8/3K4/8/4R3 w - - 0 1',
        parMoves: 17,
      },
    ],
  },
  {
    id: 'kpk',
    title: 'King + Pawn vs King',
    pieceSummary: 'K + P  vs  K',
    goal: 'Escort the pawn to the eighth rank and promote it to a queen.',
    technique:
      'The king goes first — get it in front of or alongside the pawn so the defender can\'t block the promotion square. Avoid pushing the pawn until the king clears its path; otherwise the lone king runs in front and stops it.',
    positions: [
      {
        label: 'King well ahead',
        fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
        parMoves: 14,
      },
      {
        label: 'King supports from behind',
        fen: '4k3/8/8/4K3/4P3/8/8/8 w - - 0 1',
        parMoves: 18,
      },
      {
        label: 'Flank file (g-pawn)',
        fen: '6k1/8/6K1/6P1/8/8/8/8 w - - 0 1',
        parMoves: 14,
      },
    ],
  },
  {
    id: 'krrk',
    title: 'Two Rooks mate',
    pieceSummary: 'K + R + R  vs  K',
    goal: 'Mate the lone king using the rook ladder.',
    technique:
      'Park one rook on a rank that cuts the king off; check with the other rook to drive the king toward the edge. Each turn shrinks the box by one rank or file. The defender king has no good square — keep climbing the ladder.',
    positions: [
      {
        label: 'Rooks in the corners',
        fen: '8/8/8/4k3/8/8/8/R3K2R w KQ - 0 1',
        parMoves: 10,
      },
      {
        label: 'King already on the back rank',
        fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
        parMoves: 8,
      },
    ],
  },
  {
    id: 'kbbk',
    title: 'Two Bishops mate',
    pieceSummary: 'K + B + B  vs  K',
    goal: 'Drive the lone king into a corner and mate with both bishops.',
    technique:
      'Both bishops together cover every square of one diagonal pair — perfect for fencing a king in. Walk your king alongside, march the bishops on adjacent diagonals, and push the lone king toward any corner. This is the trickiest basic mate; don\'t worry if you need extra moves.',
    positions: [
      {
        label: 'King already cornered',
        fen: 'k7/8/8/8/3K4/8/8/2B2B2 w - - 0 1',
        parMoves: 18,
      },
      {
        label: 'Centre start (textbook)',
        fen: '4k3/8/8/8/8/8/8/2BK1B2 w - - 0 1',
        parMoves: 30,
      },
    ],
  },
]

export function getLesson(id: string | undefined): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null
}
