// Daily mystery riddle bank.
//
// Hand-written riddles, deterministically picked by day-of-year so
// every kid sees the same one today, and tomorrow's is something new.
// Answers are stored lowercase + accept several close spellings via
// the `accepts` set. No LLM involved — full content safety, zero
// per-call cost.

export interface Mystery {
  id: string
  question: string
  /** All accepted lowercase answers. The first entry is the canonical
   *  one used in the "the answer was X" reveal. */
  accepts: readonly string[]
  /** Optional one-liner shown after a correct or revealed answer. */
  explain?: string
}

export const MYSTERIES: readonly Mystery[] = [
  {
    id: 'm-001',
    question: 'I have keys but no locks, space but no room. You can enter but never leave. What am I?',
    accepts: ['keyboard', 'a keyboard'],
    explain: 'A keyboard — keys you press, a space bar, an enter key, and no door.',
  },
  {
    id: 'm-002',
    question: 'I get sharper the more you use me, and duller the longer I sit. What am I?',
    accepts: ['mind', 'a mind', 'the mind', 'brain', 'your mind'],
    explain: 'A mind — practice keeps it keen.',
  },
  {
    id: 'm-003',
    question: 'In chess, I move in an L but never break formation. What piece am I?',
    accepts: ['knight', 'a knight', 'the knight', 'n'],
    explain: 'The knight — the only piece that can jump over others.',
  },
  {
    id: 'm-004',
    question: 'I am tall when I am young and short when I am old. What am I?',
    accepts: ['candle', 'a candle', 'the candle'],
    explain: 'A candle — it shrinks as it burns.',
  },
  {
    id: 'm-005',
    question: 'I have cities but no houses, mountains but no trees, water but no fish. What am I?',
    accepts: ['map', 'a map', 'the map'],
    explain: 'A map — full of places, empty of things.',
  },
  {
    id: 'm-006',
    question: 'In chess, what is the only piece that never moves in a straight line?',
    accepts: ['knight', 'a knight', 'the knight'],
    explain: 'The knight — its L is the closest a chess piece gets to a curve.',
  },
  {
    id: 'm-007',
    question: 'What has hands but cannot clap?',
    accepts: ['clock', 'a clock', 'the clock'],
    explain: 'A clock — hour, minute, sometimes second.',
  },
  {
    id: 'm-008',
    question: 'I am light as a feather, but the strongest player cannot hold me for long. What am I?',
    accepts: ['breath', 'a breath', 'your breath'],
    explain: 'Your breath — try holding one for a minute.',
  },
  {
    id: 'm-009',
    question: 'What goes up but never comes down?',
    accepts: ['age', 'your age', 'my age'],
    explain: 'Your age — only ever upward.',
  },
  {
    id: 'm-010',
    question: 'On a chessboard, a pawn promotes when it reaches which rank from its starting side?',
    accepts: ['eighth', '8th', '8', 'the eighth', 'eighth rank'],
    explain: 'The 8th rank from the pawn\'s starting side — it can become a queen, rook, bishop, or knight.',
  },
  {
    id: 'm-011',
    question: 'I follow you all day but vanish at night. What am I?',
    accepts: ['shadow', 'a shadow', 'your shadow', 'my shadow'],
    explain: 'Your shadow — gone the moment the light leaves.',
  },
  {
    id: 'm-012',
    question: 'The more there is, the less you see. What is it?',
    accepts: ['darkness', 'dark'],
    explain: 'Darkness — more of it, less visible.',
  },
]

const DAY_MS = 24 * 60 * 60 * 1000

/** Pick today's mystery deterministically. UTC day-of-year keeps the
 *  same puzzle in view for every kid worldwide while it's "today" in
 *  the castle's reference timezone. */
export function todaysMystery(now = Date.now()): Mystery {
  const dayKey = Math.floor(now / DAY_MS)
  return MYSTERIES[dayKey % MYSTERIES.length]!
}

/** Loose match — strip punctuation + lowercase + trim, then check
 *  against the accepts list. */
export function isCorrect(mystery: Mystery, raw: string): boolean {
  const clean = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  if (!clean) return false
  return mystery.accepts.some((a) => a.replace(/[^\p{L}\p{N}\s]/gu, '').trim() === clean)
}

// ─── Local "solved today" cache (UX nicety) ─────────────────────────

const SOLVED_KEY = 'puc:terminal-mystery-solved'

interface SolvedDoc {
  dayKey: number
  mysteryId: string
}

export function readSolvedToday(now = Date.now()): SolvedDoc | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SOLVED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SolvedDoc>
    if (typeof parsed.dayKey !== 'number') return null
    const todayKey = Math.floor(now / DAY_MS)
    if (parsed.dayKey !== todayKey) return null
    return parsed as SolvedDoc
  } catch {
    return null
  }
}

export function markSolvedToday(mysteryId: string, now = Date.now()): void {
  if (typeof window === 'undefined') return
  const doc: SolvedDoc = { dayKey: Math.floor(now / DAY_MS), mysteryId }
  window.localStorage.setItem(SOLVED_KEY, JSON.stringify(doc))
}
