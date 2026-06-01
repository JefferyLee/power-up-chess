// High-level history API used by the screens.

import { getDb, type SavedGame } from './db'

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

/** Delete every saved game. Used by the "Forget all data" control. */
export async function clearAllGames(): Promise<void> {
  const db = await getDb()
  await db.clear('games')
}

/** Total game count — cheap query for the menu badge. */
export async function countGames(): Promise<number> {
  const db = await getDb()
  return db.count('games')
}
