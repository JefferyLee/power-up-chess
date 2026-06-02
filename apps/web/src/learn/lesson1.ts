// Lesson 1 — "The board and the pieces"
//
// Goal: a kid who has never played chess walks out knowing how each
// piece moves. ~3 min, 13 steps. Lucy narrates.

import type { Lesson } from './lessonTypes'

// Reusable FENs — both kings always present so chess.js accepts them.
// Kings are tucked into corners so they don't distract.
const POS_PAWN = '4k3/8/8/8/8/8/4P3/K7 w - - 0 1'
const POS_KNIGHT = '4k3/8/8/8/8/8/8/K5N1 w - - 0 1'
const POS_BISHOP = '4k3/8/8/8/8/8/8/K1B5 w - - 0 1'
const POS_ROOK = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1'
const POS_QUEEN = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1'
const POS_KING_ONLY = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'
const POS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const LESSON_1: Lesson = {
  id: 'basics',
  title: 'The board and the pieces',
  blurb: "How each piece moves. Start here if you've never played chess.",
  estimatedMinutes: 3,
  hostId: 'lucy',
  steps: [
    {
      kind: 'intro',
      fen: POS_START,
      body:
        "Hi, I'm Lucy! Let's learn chess together. The board has 64 squares — " +
        '8 rows (called ranks) and 8 columns (called files). White starts at the bottom.',
    },
    // ── Pawn ────────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_PAWN,
      from: 'e2',
      to: 'e4',
      body:
        "Pawns are the little soldiers in front. They walk forward — one square at a time, " +
        'or two squares on their very first move.',
    },
    {
      kind: 'try-move',
      fen: POS_PAWN,
      from: 'e2',
      to: 'e4',
      body: 'Your turn! Drag the e2 pawn forward two squares to e4.',
      successBody: 'Nice! Pawns are simple but very important — they shape the whole game.',
    },
    // ── Knight ──────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_KNIGHT,
      from: 'g1',
      to: 'f3',
      body:
        "The knight jumps in an L-shape: two squares one way, then one square sideways. " +
        "It's the only piece that can jump OVER other pieces!",
    },
    {
      kind: 'try-move',
      fen: POS_KNIGHT,
      from: 'g1',
      to: 'f3',
      body: 'Your turn — jump the knight from g1 to f3.',
      successBody: 'Beautiful jump! Knights take a little practice but they get fun fast.',
    },
    // ── Bishop ──────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_BISHOP,
      from: 'c1',
      to: 'g5',
      body:
        'Bishops walk along diagonals only — like sneaky priests sliding across the board. ' +
        'A bishop stays on one colour the whole game.',
    },
    {
      kind: 'try-move',
      fen: POS_BISHOP,
      from: 'c1',
      to: 'g5',
      body: 'Try it. Move the bishop from c1 to g5.',
      successBody: "A bishop's reach is enormous on an open board.",
    },
    // ── Rook ────────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_ROOK,
      from: 'a1',
      to: 'a8',
      body: 'Rooks are the towers. They move in straight lines — up, down, left, or right.',
    },
    {
      kind: 'try-move',
      fen: POS_ROOK,
      from: 'a1',
      to: 'a8',
      body: 'Slide the rook all the way from a1 up to a8.',
      successBody: 'Rooks love open files like that one.',
    },
    // ── Queen ───────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_QUEEN,
      from: 'd1',
      to: 'h5',
      body:
        'The queen is the strongest piece — she can move like a rook AND like a bishop. ' +
        "Don't lose her early!",
    },
    {
      kind: 'try-move',
      fen: POS_QUEEN,
      from: 'd1',
      to: 'h5',
      body: 'Move the queen from d1 to h5.',
      successBody: 'Powerful! See how many squares she can attack from there.',
    },
    // ── King ────────────────────────────────────────────────────────
    {
      kind: 'arrow',
      fen: POS_KING_ONLY,
      from: 'e1',
      to: 'e2',
      body:
        'The king is the most important piece — but also the slowest. ' +
        'He only moves one square at a time, in any direction. ' +
        'If your king is captured, you lose!',
    },
    // ── Outro ───────────────────────────────────────────────────────
    {
      kind: 'outro',
      title: 'Lesson 1 done!',
      body:
        'Great work — you now know how every piece moves. ' +
        "Next up: captures and what 'check' means.",
    },
  ],
}
