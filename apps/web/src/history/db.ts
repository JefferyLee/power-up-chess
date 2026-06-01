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

interface HistoryDB extends DBSchema {
  games: {
    key: string
    value: SavedGame
    indexes: { 'by-playedAt': number }
  }
}

const DB_NAME = 'puc-history'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<HistoryDB>> | null = null

export function getDb(): Promise<IDBPDatabase<HistoryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('games', { keyPath: 'id' })
        store.createIndex('by-playedAt', 'playedAt')
      },
    })
  }
  return dbPromise
}
