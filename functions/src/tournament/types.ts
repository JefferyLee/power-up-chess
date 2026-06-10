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
  /** P2.H Slice 4 — private game room minted by the white player.
   *  Both kids click into /r/{roomId} to play. */
  roomId?: string
  /** P2.H Slice 5 — opposing player has flagged the reported result.
   *  Result still counts for standings until an admin overrides; the
   *  flag is what surfaces the row to the admin's override pane. */
  disputed?: {
    byNormalizedName: string
    at: number
    /** Short, free-text. Trimmed + clamped to 140 chars server-side. */
    reason?: string
  }
  /** Admin override stamp. Locks the row from further disputes once set. */
  overriddenBy?: {
    normalizedName: string
    at: number
    /** What the result was before override — for the audit trail. */
    previousResult?: PairingResult
  }
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

/** Spec gate — must have solved this many puzzles in the same ISO
 *  week as the tournament. Tracked via guest.puzzleSolvesThisWeek
 *  (incremented by submitPuzzleAttempt). */
export const TOURNAMENT_ENTRY_WEEKLY_SOLVES = 50
/** Beta fallback — lifetime puzzle solves. Lets existing engaged
 *  kids in during the rollout while the weekly counter accumulates.
 *  Will tighten once weekly tracking has been live for a few weeks. */
export const TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES = 5

/** P2.H Slice 3 — winner reward. */
export const TOURNAMENT_WINNER_REWARD_PTS = 100
/** How long the winner's 🏆 crown cosmetic lasts (set on close). */
export const TOURNAMENT_CROWN_MS = 7 * 24 * 60 * 60 * 1000

/** Soft close horizon — one week from open. */
export const TOURNAMENT_WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Hard ceiling on round count so a pairing loop can never run
 *  forever even if generators degenerate. */
export const TOURNAMENT_MAX_ROUNDS = 7
