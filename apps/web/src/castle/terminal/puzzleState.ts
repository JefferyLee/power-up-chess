// Per-browser state for the terminal's /puzzle command.
//
// Multi-step puzzles need to remember: which puzzle is in progress,
// what move index the kid is on, and how many wrong tries they've
// used. Stored locally; clears on /puzzle skip or solve.

const KEY = 'puc:terminal-puzzle-state'
const MAX_ATTEMPTS = 3

export interface PuzzleSession {
  puzzleId: string
  /** UCI moves of the full solution. */
  solution: string[]
  /** Index into solution[] the kid is currently expected to play.
   *  Always points to a "kid move" — opponent moves at odd offsets
   *  are auto-played server-side… here, client-side. */
  idx: number
  /** PGN of the position so we can resume after /exit. */
  pgn: string
  /** Wrong-guess counter; resets each puzzle. */
  wrong: number
  /** ms epoch of when this puzzle started — for analytics nice-to-have. */
  startedAt: number
}

export const PUZZLE_MAX_ATTEMPTS = MAX_ATTEMPTS

export function loadPuzzle(): PuzzleSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PuzzleSession>
    if (typeof parsed.puzzleId !== 'string' || !Array.isArray(parsed.solution)) return null
    return {
      puzzleId: parsed.puzzleId,
      solution: parsed.solution.map(String),
      idx: typeof parsed.idx === 'number' ? parsed.idx : 0,
      pgn: typeof parsed.pgn === 'string' ? parsed.pgn : '',
      wrong: typeof parsed.wrong === 'number' ? parsed.wrong : 0,
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function savePuzzle(s: PuzzleSession): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearPuzzle(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY)
}
