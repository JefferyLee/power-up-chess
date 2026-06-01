// IndexedDB-backed match history.
//
// MVP0 stores everything locally per the privacy stance — no Firestore writes.
// MVP1 will mirror to Firestore for cross-device continuity (still keeping a
// "Forget all data" path).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { HostId } from '../hosts/hosts'
import type { EndReason } from '../rooms/types'

export interface SavedGame {
  /** Stable, idempotent id. online:ROOMID for online games; local:UUID otherwise. */
  id: string
  playedAt: number
  mode: 'local' | 'online'
  whiteName: string
  blackName: string
  hostId: HostId
  result: 'white' | 'black' | 'draw'
  endReason: EndReason
  pgn: string
  finalFen: string
  moveCount: number
}

export interface PuzzleAttempt {
  /** Composite key: `${puzzleId}:${attemptedAt}` so each attempt is unique. */
  id: string
  puzzleId: string
  attemptedAt: number
  /** Wall-clock from first interaction to solve (or give-up). */
  solveTimeMs: number
  wrongMoves: number
  hintsUsed: number
  /** True iff the player completed the puzzle without revealing the solution. */
  solved: boolean
  /** 0 if not solved; 10–25 if solved. */
  points: number
  /** 1–3 stars; 0 sentinel when not solved. */
  stars: 0 | 1 | 2 | 3
}

interface HistoryDB extends DBSchema {
  games: {
    key: string
    value: SavedGame
    indexes: { 'by-playedAt': number }
  }
  puzzle_attempts: {
    key: string
    value: PuzzleAttempt
    indexes: { 'by-puzzleId': string; 'by-attemptedAt': number }
  }
}

const DB_NAME = 'puc-history'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null

export function getDb(): Promise<IDBPDatabase<HistoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const games = db.createObjectStore('games', { keyPath: 'id' })
          games.createIndex('by-playedAt', 'playedAt')
        }
        if (oldVersion < 2) {
          const attempts = db.createObjectStore('puzzle_attempts', { keyPath: 'id' })
          attempts.createIndex('by-puzzleId', 'puzzleId')
          attempts.createIndex('by-attemptedAt', 'attemptedAt')
        }
      },
    })
  }
  return dbPromise
}
