// Lesson 3 — "Checkmate"
//
// Goal: a kid recognizes the most common mating patterns and can
// deliver one themselves. ~4 min, 11 steps. Lucy.

import type { Lesson } from './lessonTypes'

export const LESSON_3: Lesson = {
  id: 'checkmate',
  title: 'Checkmate — winning the game',
  blurb: 'Back-rank mate, fool’s mate, scholar’s mate — the patterns every player knows.',
  estimatedMinutes: 4,
  hostId: 'lucy',
  steps: [
    {
      kind: 'intro',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      body:
        "Welcome back! Checkmate is when the king is in check AND can't escape — " +
        "can't move away, can't block, can't capture the attacker. The game ends. " +
        "Let's look at some classic patterns.",
    },
    // ── Back-rank mate ──────────────────────────────────────────────
    {
      kind: 'intro',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      body:
        "First: back-rank mate. The black king is trapped on the 8th rank — its own " +
        "pawns on f7, g7, h7 block any escape. All it needs is a rook or queen " +
        "on the back rank, and it's over.",
    },
    {
      kind: 'arrow',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      from: 'a1',
      to: 'a8',
      body: 'Watch the rook swing to a8. Check — and the king has nowhere to go.',
    },
    {
      kind: 'try-move',
      fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
      from: 'a1',
      to: 'a8',
      body: 'Your turn — deliver the back-rank mate.',
      successBody: 'Checkmate! Always be careful when your own pawns trap your king on the back rank.',
    },
    // ── Scholar's mate setup ────────────────────────────────────────
    {
      kind: 'intro',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      body:
        "Next: scholar’s mate. This trap catches beginners all the time. " +
        "White has aimed both the queen and the bishop at the f7 pawn — " +
        "the weakest square next to the black king.",
    },
    {
      kind: 'arrow',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      from: 'h5',
      to: 'f7',
      body:
        'The queen captures on f7, defended by the bishop on c4. The king ' +
        "can't take (the bishop is watching), can't run, can't block.",
    },
    {
      kind: 'try-move',
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
      from: 'h5',
      to: 'f7',
      body: "Deliver scholar's mate — Queen takes f7.",
      successBody: "Brutal! Remember to watch your f7 (or f2) square in every opening.",
    },
    // ── Fool's mate (player plays black this time) ──────────────────
    {
      kind: 'intro',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
      orientation: 'b',
      body:
        "And the fastest mate in chess — fool’s mate. White played two " +
        "terrible pawn moves (f3 and g4), opening a diagonal straight to their king. " +
        "Now it's BLACK to move. Can you see it?",
    },
    {
      kind: 'arrow',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
      orientation: 'b',
      from: 'd8',
      to: 'h4',
      body: 'Black’s queen slides to h4 — checkmate in 2 moves!',
    },
    {
      kind: 'try-move',
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
      orientation: 'b',
      from: 'd8',
      to: 'h4',
      body: "Play Black's queen to h4 and finish it.",
      successBody:
        'Done in two moves! This is why you NEVER weaken your king’s shelter with random pawn moves.',
    },
    {
      kind: 'outro',
      title: 'Lesson 3 done!',
      body:
        "You've seen three classic mates. Knowing patterns like these is most of " +
        "what chess study is — pattern memory. Next: a few special moves the rules " +
        "let you do.",
    },
  ],
}
