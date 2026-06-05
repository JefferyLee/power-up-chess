// Castle + chess lore entries. Hand-written, indexed by short key.
// Read aloud (in the kid's head) by Lucy or Luca depending on topic.
// Same content-safety guarantees as the riddles: no LLM in the loop.

export interface LoreEntry {
  /** Short key the kid types, e.g. /lore queen. */
  key: string
  /** Pretty title shown above the body. */
  title: string
  /** 2-4 sentence body. Plain text. */
  body: string
  /** Who the prose sounds like — flavoured intro line uses this. */
  voice: 'lucy' | 'luca'
}

export const LORE: readonly LoreEntry[] = [
  {
    key: 'queen',
    title: 'On the queen',
    voice: 'lucy',
    body:
      'For most of chess\'s history, the piece beside the king was a slow one — moving only one square at a time. It was Spanish players in the 1400s who let her sweep the whole board. Some called the change "mad queen chess." It made games much shorter, and much sharper.',
  },
  {
    key: 'knight',
    title: 'On the knight',
    voice: 'luca',
    body:
      'The knight is the only piece that ignores other pieces in its path. It just hops — over friends and foes alike. That little independence is why knights tangle so often with bishops: bishops want clear lines; knights laugh at clutter.',
  },
  {
    key: 'castle',
    title: 'On castling',
    voice: 'luca',
    body:
      'Castling tucks the king behind a wall and brings a sleepy rook into the game in a single move. It is the only move where two pieces step at once. Kids who learn it early start winning a lot more — a safe king lets the rest of the army take risks.',
  },
  {
    key: 'rook',
    title: 'On rooks',
    voice: 'lucy',
    body:
      'Rooks belong to open files like cats belong to sunbeams. They look slow at the start, almost forgotten in their corners, but in the endgame they suddenly become the strongest piece on the board. Treat them well.',
  },
  {
    key: 'bishop',
    title: 'On bishops',
    voice: 'lucy',
    body:
      'Each bishop is bound to one colour of square for life. A pair of bishops together is famously strong: they cover every diagonal between them. Lone bishops, especially in endgames, can feel stuck — half the board is forbidden ground.',
  },
  {
    key: 'pawn',
    title: 'On pawns',
    voice: 'luca',
    body:
      'A pawn is the smallest piece, but it dreams the largest dream: cross the board and become a queen. Most pawns never make it. The ones who do change a whole game.',
  },
  {
    key: 'opening',
    title: 'On openings',
    voice: 'luca',
    body:
      'The first dozen moves are about three things: get your knights and bishops out, get your king safe, and put a pawn or two in the centre. If you have done all three by move ten, you are doing the opening right — whatever the name of the opening you played.',
  },
  {
    key: 'endgame',
    title: 'On endgames',
    voice: 'lucy',
    body:
      'When there are only a few pieces left, the king walks out of his corner and joins the fight. New players are surprised by this — they keep him hidden out of habit. A bold king in the endgame is often the difference between a win and a draw.',
  },
  {
    key: 'castle-history',
    title: 'About the Castle',
    voice: 'lucy',
    body:
      'No one quite remembers who built it. The Great Hall has been here longer than anyone alive. The Tower came later, the Garden later still. The Cellar — when it opens — is said to be older than all of them.',
  },
  {
    key: 'lucy',
    title: 'About Lucy',
    voice: 'lucy',
    body:
      'I keep the Reading Nook. I have read a lot of books and I tell stories badly when I am tired. Bring me a question about a story you read and I will probably remember it.',
  },
  {
    key: 'luca',
    title: 'About Luca',
    voice: 'luca',
    body:
      'I keep the Study at the top of the Tower. I like maps of places that may not exist. I also like clean endgames — they feel like a tidy desk.',
  },
]

export function findLore(query: string): LoreEntry | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  // Exact key first; then partial match against title/key.
  for (const e of LORE) {
    if (e.key === q) return e
  }
  for (const e of LORE) {
    if (e.key.includes(q) || e.title.toLowerCase().includes(q)) return e
  }
  return null
}
