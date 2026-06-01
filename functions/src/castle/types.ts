// Castle Cloud Function request/response types. Shared between the
// client `firebase/callables.ts` wrapper and the functions themselves.

export interface CastleEnterRequest {
  /** Display-cased name as typed by the visitor. */
  name: string
  /** Hex sha256 of `normalizedName + ':' + magicWord`, computed client-side. */
  hash: string
}

export type CastleEnterResponse =
  | {
      status: 'new'
      displayName: string
      castlePoints: 0
      decayedBy: 0
      pointsBeforeDecay: 0
    }
  | {
      status: 'returning'
      displayName: string
      castlePoints: number
      /** Points lost to decay this visit (§7.4). 0 if same day. */
      decayedBy: number
      /** Castle points before decay was applied. Equal to `castlePoints + decayedBy`. */
      pointsBeforeDecay: number
    }
  | {
      status: 'wrong-magic'
      attemptsRemaining: number
    }
  | {
      status: 'rate-limited'
      retryAfterMs: number
    }
  | {
      status: 'invalid-input'
      reason: string
    }

export interface CastleBypassResponse {
  /** A generated throwaway display name, format `Guest-NNNN`. */
  displayName: string
}

// ─── Award castle points ───────────────────────────────────────────────────

export type AwardSource =
  | { source: 'puzzle'; puzzleId: string; scorePoints: number; isFirstSolve: boolean }
  | { source: 'chess-win'; gameId: string }
  | { source: 'chess-review'; gameId: string; brilliant: number; bestExcellent: number }

export interface AwardCastlePointsRequest {
  normalizedName: string
  award: AwardSource
}

export interface AwardCastlePointsResponse {
  castlePoints: number
  added: number
  unlockedJustNow: boolean
}

// Per-source amount caps. Server clamps the client's reported amount
// so a malicious client can't grant themselves unlimited points.
export const AWARD_CAPS = {
  puzzleMin: 10,
  puzzleMax: 25,
  puzzleFirstSolveBonus: 5,
  chessWin: 10,
  chessBrilliantEach: 5,
  chessBestExcellentEach: 1,
  // Per-review absolute ceiling to short-circuit "I had 1000 best moves" claims.
  chessReviewMax: 60,
} as const

export const UNLOCK_THRESHOLD = 200

// ─── Public stats ──────────────────────────────────────────────────────────

export interface CastlePublicStats {
  activeToday: number
  topGuests: Array<{ displayName: string; castlePoints: number }>
  /** Server ts when this doc was last rebuilt. */
  refreshedAt: number
}

/** Firestore shape for guests/{normalizedName}. */
export interface GuestDoc {
  displayName: string
  normalizedName: string
  magicWordHash: string
  uids: string[]
  castlePoints: number
  createdAt: number
  lastVisitAt: number
}

/** Firestore shape for castle_enter_attempts/{uid} — used to track the
 *  per-session 3-strike state on the server, so the bypass link can't
 *  be brute-forced. */
export interface EnterAttemptsDoc {
  /** Tally of consecutive wrong-magic responses since the last successful
   *  enter or bypass. Resets on success or bypass. */
  consecutiveWrong: number
  /** Total enter attempts in the current rolling window. Used for the
   *  rate limit. */
  totalInWindow: number
  windowStart: number
  /** When the next request is allowed. 0 = always allowed. */
  blockedUntil: number
}
