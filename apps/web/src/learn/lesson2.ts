// Lesson 2 — "Captures and check"
//
// Goal: a kid who finished lesson 1 learns how pieces capture
// each other, and what "check" means. ~3 min, 12 steps. Luca.

import type { Lesson } from './lessonTypes'

export const LESSON_2: Lesson = {
  id: 'captures-check',
  title: 'Captures and check',
  blurb: 'How pieces eat each other, and how to attack the king.',
  estimatedMinutes: 3,
  hostId: 'luca',
  steps: [
    {
      kind: 'intro',
      fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      body:
        "Hi! I'm Luca. You know how the pieces move — now let's see how " +
        "they capture each other. To capture, you simply move your piece " +
        "ONTO the enemy piece's square. The enemy piece is removed.",
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      from: 'e4',
      to: 'd5',
      body:
        'Pawns are special — they walk forward but capture diagonally one ' +
        "square. Watch the white pawn take the black pawn.",
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1',
      from: 'e4',
      to: 'd5',
      body: 'Your turn — capture the black pawn with the white pawn.',
      successBody: "Captured! Notice that the pawn moves DIAGONALLY only when it captures.",
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/5p2/8/8/2B1K3 w - - 0 1',
      from: 'c1',
      to: 'f4',
      body:
        'Other pieces capture the same way they move. The bishop slides on a ' +
        'diagonal and lands on the enemy pawn.',
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/5p2/8/8/2B1K3 w - - 0 1',
      from: 'c1',
      to: 'f4',
      body: 'Capture the black pawn with the bishop.',
      successBody: 'Sliced! A bishop can pick off pieces from far away.',
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/8/5p2/8/4K1N1 w - - 0 1',
      from: 'g1',
      to: 'f3',
      body: 'The knight jumps onto the enemy square — same L-shape, just landing on a pawn.',
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/8/5p2/8/4K1N1 w - - 0 1',
      from: 'g1',
      to: 'f3',
      body: 'Jump the knight onto the f3 pawn.',
      successBody: 'Snap! Knights are sneaky capturers because they jump over pieces.',
    },
    // ── Check ───────────────────────────────────────────────────────
    {
      kind: 'intro',
      fen: '3k4/8/8/8/3Q4/8/8/4K3 w - - 0 1',
      body:
        'Now — the king. The king is special: when your king is being attacked, ' +
        "we call it CHECK. The king MUST get out of check on the next move. " +
        "If it can't, the game is over.",
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/Q7/8/8/4K3 w - - 0 1',
      from: 'a4',
      to: 'e4',
      body:
        'Watch the queen move to e4. Suddenly she lines up with the black king on the e-file — the king is in check!',
    },
    {
      kind: 'try-move',
      fen: '4k3/8/8/8/Q7/8/8/4K3 w - - 0 1',
      from: 'a4',
      to: 'e4',
      body: 'Your turn — move the queen to e4 and give check.',
      successBody: 'Check! The black king now has to deal with that queen — move away, block, or capture her.',
    },
    {
      kind: 'arrow',
      fen: '4k3/8/8/8/4Q3/8/8/4K3 b - - 0 1',
      orientation: 'b',
      from: 'e8',
      to: 'd7',
      body: "The black king's job is to escape. Here, stepping to d7 gets the king off the e-file and out of check.",
    },
    {
      kind: 'outro',
      title: 'Lesson 2 done!',
      body:
        'You can now capture pieces and put the enemy king in check. ' +
        "Next we'll learn what happens when the king CAN'T escape: checkmate.",
    },
  ],
}
