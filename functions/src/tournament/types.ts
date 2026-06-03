// Weekly Tournament Firestore shape (P2.H Slice 2).
//
// Forward-compatible from Slice 1: rounds + result-reporting fields
// are now populated. The winner-crown cosmetic + automatic
// online-chess-room generation land in Slice 3.

export interface TournamentParticipant {
  normalizedName: string
  displayName: string
  registeredAt: number
}

/** A bye slot uses this synthetic opponent name. */
export const BYE_OPPONENT = '__bye__'

export type PairingResult =
  | 'white-wins'
  | 'black-wins'
  | 'draw'
  | 'bye-white'

export interface Pairing {
  /** Index within the round, 0-based. */
  index: number
  /** Both are normalizedName. `black` is BYE_OPPONENT for a free
   *  point. */
  white: string
  black: string
  result?: PairingResult
  /** normalizedName of whichever player reported the result. */
  reportedBy?: string
  reportedAt?: number
}

export interface TournamentRound {
  index: number
  startedAt: number
  pairings: Pairing[]
}

export interface TournamentDoc {
  weekKey: string
  status: 'registration' | 'active' | 'closed'
  openedAt: number
  closesAt: number
  participants: TournamentParticipant[]
  rounds: TournamentRound[]
  /** displayName stamped on close (highest score wins). */
  winnerName?: string
  closedAt?: number
}

/** Beta entry gate — must have solved at least this many puzzles
 *  total. Slice 3 will replace with the spec's "50 puzzles solved
 *  THIS WEEK" rule once weekly counters are in place. */
export const TOURNAMENT_ENTRY_MIN_SOLVES = 5

/** Soft close horizon — one week from open. */
export const TOURNAMENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Hard ceiling on round count so a pairing loop can never run
 *  forever even if generators degenerate. */
export const TOURNAMENT_MAX_ROUNDS = 7
