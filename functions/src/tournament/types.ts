// Weekly Tournament Firestore shape (P2.H Slice 1).
//
// Only registration this slice — rounds, pairings, results, and the
// winner crown land in later slices. The doc shape is intentionally
// forward-compatible: future fields slot in without migrating the
// existing registration rows.

export interface TournamentParticipant {
  normalizedName: string
  displayName: string
  registeredAt: number
}

export interface TournamentDoc {
  /** ISO week key, e.g. 2026-W23. */
  weekKey: string
  /** 'registration' until pairings start, 'active' during play, 'closed'
   *  after the final result. Slice 1 keeps everything 'registration'. */
  status: 'registration' | 'active' | 'closed'
  openedAt: number
  /** Soft close time. Slice 1 uses openedAt + 7 days; slice 2 will
   *  tighten to "Sunday 23:59 LA of the same week". */
  closesAt: number
  participants: TournamentParticipant[]
}

/** Beta entry gate — must have solved at least this many puzzles
 *  total. Slice 2 will replace with the spec's "50 puzzles solved
 *  THIS WEEK" rule once weekly counters are in place. */
export const TOURNAMENT_ENTRY_MIN_SOLVES = 5

/** Soft close horizon for Slice 1 — one week from open. */
export const TOURNAMENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000
