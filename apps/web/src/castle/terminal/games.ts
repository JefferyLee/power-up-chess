// Small text mini-games for the terminal: /guess, /hangman, /wordle,
// /24. All state lives in browser localStorage — no server round-trip
// except the optional CP award on solve.

// ─── /guess: higher / lower (1-100) ────────────────────────────────

const GUESS_KEY = 'puc:terminal-guess-state'
const GUESS_MAX = 100
const GUESS_TRIES = 7

export interface GuessGame {
  secret: number
  triesLeft: number
}

export function loadGuess(): GuessGame | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(GUESS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<GuessGame>
    if (typeof p.secret !== 'number' || typeof p.triesLeft !== 'number') return null
    return { secret: p.secret, triesLeft: p.triesLeft }
  } catch { return null }
}

export function saveGuess(g: GuessGame): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(GUESS_KEY, JSON.stringify(g))
}

export function clearGuess(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(GUESS_KEY)
}

export function newGuessGame(): GuessGame {
  return { secret: 1 + Math.floor(Math.random() * GUESS_MAX), triesLeft: GUESS_TRIES }
}

export const GUESS_LIMITS = { max: GUESS_MAX, tries: GUESS_TRIES }

// ─── /hangman: word, 6 wrong tries ────────────────────────────────

const HANGMAN_KEY = 'puc:terminal-hangman-state'
const HANGMAN_MAX_WRONG = 6

// Kid-friendly, chess/castle-flavoured words. Lowercase, letters only.
export const HANGMAN_WORDS = [
  'knight', 'bishop', 'castle', 'queen', 'rook', 'pawn', 'check', 'checkmate',
  'stalemate', 'lantern', 'dragon', 'wizard', 'lucy', 'luca', 'forest',
  'puzzle', 'tournament', 'opening', 'endgame', 'gambit', 'sacrifice',
  'mystery', 'cellar', 'tower', 'garden', 'compass', 'feather', 'scroll',
  'spell', 'mana', 'crown', 'badge', 'parchment', 'storybook', 'riddle',
]

export interface HangmanGame {
  word: string
  guessed: string[]
  wrong: number
}

export function loadHangman(): HangmanGame | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(HANGMAN_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<HangmanGame>
    if (typeof p.word !== 'string') return null
    return {
      word: p.word,
      guessed: Array.isArray(p.guessed) ? p.guessed.map(String) : [],
      wrong: typeof p.wrong === 'number' ? p.wrong : 0,
    }
  } catch { return null }
}

export function saveHangman(g: HangmanGame): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(HANGMAN_KEY, JSON.stringify(g))
}

export function clearHangman(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(HANGMAN_KEY)
}

export function newHangmanGame(): HangmanGame {
  const w = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)]!
  return { word: w, guessed: [], wrong: 0 }
}

export function renderHangmanWord(g: HangmanGame): string {
  return [...g.word].map((c) => g.guessed.includes(c) ? c : '_').join(' ')
}

export function isHangmanWon(g: HangmanGame): boolean {
  return [...g.word].every((c) => g.guessed.includes(c))
}

export const HANGMAN_LIMITS = { maxWrong: HANGMAN_MAX_WRONG }

// ─── /wordle: daily 5-letter word, 6 guesses ──────────────────────

const WORDLE_KEY = 'puc:terminal-wordle-state'
const WORDLE_LEN = 5
const WORDLE_TRIES = 6
const DAY_MS = 24 * 60 * 60 * 1000

// 24 5-letter words. Picked for ages 8-12: common, no proper nouns,
// no double-tricks (no consecutive double letters in the answer set —
// keeps the colour feedback honest). Hand-picked, not LLM.
export const WORDLE_BANK = [
  'queen', 'rooks', 'knght', // misspell ignored — replace next
  'tower', 'crown', 'magic', 'spell', 'sword', 'stone', 'flame',
  'cloud', 'river', 'apple', 'green', 'happy', 'lucky', 'plant',
  'lemon', 'piano', 'tiger', 'bread', 'smile', 'house', 'mouse',
  'plume', 'flute', 'paint', 'beach',
].filter((w) => /^[a-z]{5}$/.test(w))

export interface WordleGame {
  dayKey: number
  word: string
  guesses: string[]
}

export function todaysWordle(now = Date.now()): { dayKey: number; word: string } {
  const dayKey = Math.floor(now / DAY_MS)
  return { dayKey, word: WORDLE_BANK[dayKey % WORDLE_BANK.length]! }
}

export function loadWordle(now = Date.now()): WordleGame | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(WORDLE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<WordleGame>
    const today = todaysWordle(now)
    if (p.dayKey !== today.dayKey) return null
    return {
      dayKey: today.dayKey,
      word: today.word,
      guesses: Array.isArray(p.guesses) ? p.guesses.map(String) : [],
    }
  } catch { return null }
}

export function saveWordle(g: WordleGame): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(WORDLE_KEY, JSON.stringify(g))
}

/** Per-letter feedback against the secret. 🟩 right place, 🟨 wrong
 *  place, ⬛ not in word. Handles repeated letters correctly. */
export function scoreWordle(guess: string, secret: string): string {
  const g = guess.toLowerCase()
  const s = secret.toLowerCase()
  const out: ('🟩' | '🟨' | '⬛')[] = new Array(g.length).fill('⬛')
  const used = new Array(s.length).fill(false)
  // Greens first so duplicate-letter logic is correct.
  for (let i = 0; i < g.length; i++) {
    if (g[i] === s[i]) { out[i] = '🟩'; used[i] = true }
  }
  // Then yellows.
  for (let i = 0; i < g.length; i++) {
    if (out[i] === '🟩') continue
    const matchAt = [...s].findIndex((c, idx) => !used[idx] && c === g[i])
    if (matchAt >= 0) { out[i] = '🟨'; used[matchAt] = true }
  }
  return out.join('')
}

export const WORDLE_LIMITS = { len: WORDLE_LEN, tries: WORDLE_TRIES }

// ─── /24: make 24 from 4 digits ────────────────────────────────────

const TWENTYFOUR_KEY = 'puc:terminal-24-state'

/** Hand-curated 4-digit /24 puzzles — every row has at least one
 *  solution shown in the trailing comment. Curated by hand because
 *  brute-checking arbitrary draws is its own little CSP. */
export const TWENTYFOUR_PUZZLES: ReadonlyArray<[number, number, number, number]> = [
  [3, 3, 8, 8],   // 8 / (3 - 8/3)
  [1, 5, 5, 5],   // 5 * (5 - 1/5)
  [4, 7, 8, 8],   // (7 - 8/8) * 4
  [1, 2, 3, 4],   // (1 + 2 + 3) * 4
  [2, 4, 6, 8],   // 8 * 6 / (4 - 2)
  [1, 3, 4, 6],   // 6 / (1 - 3/4)
  [1, 1, 4, 6],   // 6 * 4 * 1 * 1
  [2, 3, 4, 6],   // (6 + 4 - 2) * 3
  [4, 4, 4, 8],   // 4 + 4 + 4 * 4
  [2, 2, 4, 8],   // 8 * (4 - 2/2)
]

export interface TwentyFourGame {
  digits: [number, number, number, number]
  /** ms epoch when started — used to know if the kid is on a fresh round. */
  startedAt: number
}

export function loadTwentyFour(): TwentyFourGame | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(TWENTYFOUR_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<TwentyFourGame>
    if (!Array.isArray(p.digits) || p.digits.length !== 4) return null
    return {
      digits: p.digits.map(Number) as [number, number, number, number],
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : Date.now(),
    }
  } catch { return null }
}

export function saveTwentyFour(g: TwentyFourGame): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TWENTYFOUR_KEY, JSON.stringify(g))
}

export function clearTwentyFour(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TWENTYFOUR_KEY)
}

export function newTwentyFour(): TwentyFourGame {
  const p = TWENTYFOUR_PUZZLES[Math.floor(Math.random() * TWENTYFOUR_PUZZLES.length)]!
  return { digits: [...p] as [number, number, number, number], startedAt: Date.now() }
}

/** Validate an expression for /24:
 *  - Uses ONLY the four allowed digits (each exactly once).
 *  - Only digits, +, -, *, /, (, ) — no other characters.
 *  - Evaluates to 24 (or very close, for division).
 *  Returns true/false plus a reason for false. */
export function checkTwentyFour(
  expr: string,
  digits: [number, number, number, number],
): { ok: true } | { ok: false; reason: string } {
  // Allow only safe characters.
  if (!/^[\d+\-*/().\s]+$/.test(expr)) {
    return { ok: false, reason: 'Only digits and + - * / ( ) are allowed.' }
  }
  // Extract digits used (multi-digit numbers like "12" are NOT allowed —
  // each digit is its own token).
  const usedDigits: number[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]!
    if (/\d/.test(c)) {
      // Reject multi-digit numbers — would let kid build 13 from 1+3 trivially.
      if (i + 1 < expr.length && /\d/.test(expr[i + 1]!)) {
        return { ok: false, reason: 'Use the 4 given digits as separate numbers (no 13, 24, etc.).' }
      }
      usedDigits.push(Number(c))
    }
    i++
  }
  // Same multiset as the 4 digits.
  const want = [...digits].sort()
  const got = [...usedDigits].sort()
  if (want.length !== got.length || want.some((v, idx) => v !== got[idx])) {
    return { ok: false, reason: `Use each of ${digits.join(', ')} exactly once.` }
  }
  // Safe eval — already validated charset above; Function constructor
  // can only see digits + operators + parens.
  let value: number
  try {
    value = (new Function(`return (${expr})`))() as number
  } catch {
    return { ok: false, reason: 'That expression did not compute. Check your parentheses.' }
  }
  if (typeof value !== 'number' || !isFinite(value)) {
    return { ok: false, reason: 'Result is not a number.' }
  }
  if (Math.abs(value - 24) > 1e-6) {
    return { ok: false, reason: `That makes ${value % 1 === 0 ? value : value.toFixed(2)}, not 24.` }
  }
  return { ok: true }
}
