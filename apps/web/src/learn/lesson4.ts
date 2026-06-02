// Lesson 4 — "Special moves: castling, en passant, promotion"
//
// Goal: kid knows the three "weird" rules that surprise beginners.
// ~3 min, 11 steps. Luca.

import type { Lesson } from './lessonTypes'

export const LESSON_4: Lesson = {
  id: 'special-moves',
  title: 'Special moves',
  blurb: 'Castling, en passant, and pawn promotion — the rules that look strange but are fair.',
  estimatedMinutes: 3,
  hostId: 'luca',
  steps: [
    {
      kind: 'intro',
      body:
        "Chess has three special rules that surprise new players. Once you know " +
        "them you'll never lose to a confused beginner — and you'll win games " +
        "with them.",
    },
    // ── Castling kingside ───────────────────────────────────────────
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
      from: 'e1',
      to: 'g1',
      body:
        'CASTLING kingside: the king jumps TWO squares toward the rook, and the ' +
        'rook hops over the king to land next to it. One move, two pieces. The king ' +
        'gets safer, and the rook joins the game.',
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
      from: 'e1',
      to: 'g1',
      body:
        'Castle kingside — drag the king TWO squares right (to g1). The rook ' +
        'jumps over automatically.',
      successBody:
        "Beautiful! In a real game you can only castle if the king and rook haven't " +
        "moved, no pieces are between them, and the king isn't in check.",
    },
    // ── Castling queenside ──────────────────────────────────────────
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
      from: 'e1',
      to: 'c1',
      body:
        'Castling QUEENSIDE works the same way, just to the other side. The king ' +
        'goes two squares left, the rook hops over.',
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
      from: 'e1',
      to: 'c1',
      body: 'Castle queenside.',
      successBody: 'Nice. Queenside castling is rarer but it can surprise the other player.',
    },
    // ── En passant ──────────────────────────────────────────────────
    {
      kind: 'intro',
      fen: '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1',
      orientation: 'b',
      body:
        "EN PASSANT — French for 'in passing'. White just pushed a pawn two " +
        'squares (e2-e4), trying to sneak past your pawn on d4. Chess says: ' +
        "NOPE. You can capture it as if it had moved only one square.",
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1',
      orientation: 'b',
      from: 'd4',
      to: 'e3',
      body:
        'Your d4 pawn captures DIAGONALLY to e3 — even though the white pawn is sitting on e4. ' +
        "It's like the white pawn never reached e4.",
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1',
      orientation: 'b',
      from: 'd4',
      to: 'e3',
      body: 'Take the white pawn en passant.',
      successBody:
        "Gone! Remember: en passant only works IMMEDIATELY after the opponent's two-square push. Wait one turn and you lose the chance.",
    },
    // ── Promotion ───────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
      from: 'e7',
      to: 'e8',
      body:
        'PROMOTION: a pawn that makes it to the LAST rank turns into any piece ' +
        '(except a king). Almost always you pick a queen — the strongest piece.',
    },
    {
      kind: 'try-move',
      fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1',
      from: 'e7',
      to: 'e8',
      promotion: 'q',
      body: 'Push the pawn to e8 — it becomes a queen.',
      successBody: 'Hello, new queen! Getting a pawn to the back rank usually wins the game on the spot.',
    },
    {
      kind: 'outro',
      title: 'Lesson 4 done!',
      body:
        "You now know every rule chess has. One more lesson — how to start a game " +
        "without falling into traps like the ones in lesson 3.",
    },
  ],
}
