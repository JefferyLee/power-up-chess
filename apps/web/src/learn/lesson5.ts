// Lesson 5 — "How to start: opening tips"
//
// Goal: kid leaves with 3 simple opening principles that prevent the
// most common beginner blunders. ~3 min, 10 steps. Lucy.

import type { Lesson } from './lessonTypes'

export const LESSON_5: Lesson = {
  id: 'opening-tips',
  title: 'How to start a game',
  blurb: 'Three opening principles that win you most games before they start.',
  estimatedMinutes: 3,
  hostId: 'lucy',
  steps: [
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      body:
        "Welcome to the last lesson! Three simple ideas will protect you from " +
        "almost every beginner trap and start you off with a healthy position. " +
        "Ready? Here we go.",
    },
    // ── Principle 1: Control the center ─────────────────────────────
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      body:
        "PRINCIPLE 1 — Control the center. The four middle squares (d4, e4, d5, e5) " +
        "are the most valuable real estate on the board. Pieces in the center can " +
        "reach more squares than pieces on the edge.",
    },
    {
      kind: 'arrow',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      from: 'e2',
      to: 'e4',
      body:
        'The classic opening move: e2-e4. The pawn claims a centre square AND ' +
        "opens lanes for your bishop and queen.",
    },
    {
      kind: 'try-move',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      from: 'e2',
      to: 'e4',
      body: 'Play e4 — the king’s pawn forward two squares.',
      successBody: 'A great first move. Other strong opening moves: d4, c4, Nf3.',
    },
    // ── Principle 2: Develop minor pieces ───────────────────────────
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      body:
        "PRINCIPLE 2 — Develop minor pieces (knights and bishops) FAST. " +
        "Pieces stuck on the back rank do nothing. Try to develop a new piece " +
        "every single move in the opening.",
    },
    {
      kind: 'arrow',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      from: 'g1',
      to: 'f3',
      body:
        'Nf3 — knight to f3. The knight attacks e5, controls central squares, ' +
        "and gets ready for castling. Almost always a great move.",
    },
    {
      kind: 'try-move',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      from: 'g1',
      to: 'f3',
      body: 'Develop the knight to f3.',
      successBody:
        'A classic developing move. Now your bishop can come out, and you’re close to castling.',
    },
    // ── Principle 3: King safety / Don't bring queen out early ──────
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      body:
        "PRINCIPLE 3 — Castle early! Castling does two things at once: " +
        "tucks your king safely behind pawns, AND brings a rook out where it can fight. " +
        "Aim to castle by move 10.",
    },
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      body:
        "Bonus tip: DON'T bring your queen out early. Remember scholar's mate from " +
        "lesson 3? The white queen got punished even though it set the trap. " +
        "Knights and bishops first, queen later.",
    },
    {
      kind: 'outro',
      title: 'You’re done — well done!',
      body:
        "You’ve learned the pieces, captures, check, checkmate, all the rules, " +
        "and three opening principles. That’s more than enough to start playing real " +
        "games. Try the Puzzle Garden next — small tactics puzzles built for your level.",
    },
  ],
}
