// Persistence for the terminal's /play game. localStorage-only — the
// "private session" feel demands a place that won't leak across the
// network, and bypass visitors have no Firestore record anyway.
//
// We store the PGN (chess.js handles round-trip), kid's side, status,
// and the engine rating chosen for this game. Loading rehydrates a
// Chess instance; saving writes the PGN string.

import { Chess } from 'chess.js'

const KEY = 'puc:terminal-play-state'
export const DEFAULT_RATING = 1200

export type PlayStatus = 'active' | 'kid-won' | 'kid-lost' | 'drawn' | 'resigned'

interface StoredState {
  pgn: string
  /** 'w' = kid plays White, 'b' = kid plays Black. V1 always White. */
  kidSide: 'w' | 'b'
  status: PlayStatus
  /** Engine rating chosen for this game, e.g. 1500. */
  rating: number
  /** Coach reference eval (white-POV centipawns) at the start of the
   *  kid's next turn — set after the engine plays and persisted so
   *  we can label the kid's NEXT move's cp loss against it. Null
   *  means "no reference yet, use 0" (start of game). */
  prevEvalCp?: number | null
}

export interface LoadedPlayState {
  game: Chess
  kidSide: 'w' | 'b'
  status: PlayStatus
  rating: number
  prevEvalCp: number | null
}

export function loadPlayState(): LoadedPlayState | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as Partial<StoredState>
    if (typeof stored.pgn !== 'string') return null
    const game = new Chess()
    game.loadPgn(stored.pgn)
    return {
      game,
      kidSide: stored.kidSide === 'b' ? 'b' : 'w',
      status: (stored.status as PlayStatus | undefined) ?? 'active',
      rating: typeof stored.rating === 'number' && stored.rating > 0 ? stored.rating : DEFAULT_RATING,
      prevEvalCp: typeof stored.prevEvalCp === 'number' ? stored.prevEvalCp : null,
    }
  } catch {
    return null
  }
}

export function savePlayState(
  game: Chess,
  kidSide: 'w' | 'b',
  status: PlayStatus,
  rating: number,
  prevEvalCp: number | null = null,
): void {
  if (typeof window === 'undefined') return
  const stored: StoredState = { pgn: game.pgn(), kidSide, status, rating, prevEvalCp }
  window.localStorage.setItem(KEY, JSON.stringify(stored))
}

export function clearPlayState(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(KEY)
}
