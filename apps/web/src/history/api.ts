// High-level history API used by the screens.

import { getDb, type PuzzleAttempt, type SavedGame } from './db'

/** Insert or replace a saved game. Idempotent by id (online:ROOMID etc). */
export async function saveGame(game: SavedGame): Promise<void> {
  const db = await getDb()
  await db.put('games', game)
}

/** Fetch a single saved game by id, or null if missing. */
export async function getGame(id: string): Promise<SavedGame | null> {
  const db = await getDb()
  const value = await db.get('games', id)
  return value ?? null
}

/** List all saved games, most-recent first. */
export async function listGames(): Promise<SavedGame[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('games', 'by-playedAt')
  return all.reverse()
}

/** Delete every saved game AND puzzle attempt. Used by "Forget all data". */
export async function clearAllGames(): Promise<void> {
  const db = await getDb()
  await Promise.all([db.clear('games'), db.clear('puzzle_attempts')])
}

/** Total game count — cheap query for the menu badge. */
export async function countGames(): Promise<number> {
  const db = await getDb()
  return db.count('games')
}

// --- Puzzle attempts ---

/** Persist a puzzle attempt. Composite key keeps every attempt distinct. */
export async function savePuzzleAttempt(attempt: PuzzleAttempt): Promise<void> {
  const db = await getDb()
  await db.put('puzzle_attempts', attempt)
}

/** All attempts on a single puzzle, oldest first. */
export async function attemptsForPuzzle(puzzleId: string): Promise<PuzzleAttempt[]> {
  const db = await getDb()
  return db.getAllFromIndex('puzzle_attempts', 'by-puzzleId', puzzleId)
}

/** The player's best attempt at a puzzle (highest points, ties broken by
 *  more recent). Used to render stars/score in the Garden index. */
export async function bestAttemptForPuzzle(puzzleId: string): Promise<PuzzleAttempt | null> {
  const list = await attemptsForPuzzle(puzzleId)
  if (list.length === 0) return null
  return list.reduce((best, cur) => {
    if (cur.points > best.points) return cur
    if (cur.points === best.points && cur.attemptedAt > best.attemptedAt) return cur
    return best
  })
}

/** Best-of map across every puzzle the player has attempted. */
export async function bestAttempts(): Promise<Map<string, PuzzleAttempt>> {
  const db = await getDb()
  const all = await db.getAll('puzzle_attempts')
  const best = new Map<string, PuzzleAttempt>()
  for (const a of all) {
    const cur = best.get(a.puzzleId)
    if (!cur || a.points > cur.points || (a.points === cur.points && a.attemptedAt > cur.attemptedAt)) {
      best.set(a.puzzleId, a)
    }
  }
  return best
}

/** Total points (sum of best attempt across each puzzle). */
export async function totalPuzzlePoints(): Promise<number> {
  const best = await bestAttempts()
  let total = 0
  for (const a of best.values()) total += a.points
  return total
}
