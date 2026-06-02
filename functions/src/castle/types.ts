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

/** Tags the kind of opponent for chess-win awards. Local AI tier wins
 *  are scaled by strength; human PvP wins pay the same as the top AI tier. */
export type ChessOpponent =
  | 'human'
  | 'ai-beginner'
  | 'ai-easy'
  | 'ai-medium'
  | 'ai-hard'
  | 'ai-expert'

export type AwardSource =
  | { source: 'puzzle'; puzzleId: string; scorePoints: number; isFirstSolve: boolean }
  | { source: 'chess-win'; gameId: string; opponent?: ChessOpponent }
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
  /** Legacy flat chess-win amount, retained as a fallback when the client
   *  doesn't specify an opponent (older clients / unknown source). */
  chessWin: 10,
  chessBrilliantEach: 8,
  chessBestExcellentEach: 1,
  /** Per-review ceiling — bumped 60 → 80 to leave room for the new
   *  brilliant-per-each rate. */
  chessReviewMax: 80,
  /** Per-opponent win awards. Beats the previous flat 10 for medium+ AI
   *  and humans; intentional cliff so beating a stronger opponent pays. */
  chessWinByOpponent: {
    'ai-beginner': 5,
    'ai-easy': 10,
    'ai-medium': 15,
    'ai-hard': 25,
    'ai-expert': 40,
    'human': 40,
  },
  /** Wizard's Duel end-of-game payouts (server-side only, not client-claimed). */
  duelWinner: 25,
  duelLoser: 5,
  /** Cost to OPEN (host) a private chess room. Both players don't pay —
   *  the opener is treating, joiner is free. Drains points + prevents
   *  spam-creating rooms. */
  chessRoomOpenCost: 5,
  /** Cost to OPEN a Wizard's Duel — pricier because the duel itself is
   *  the premium / point-burn experience. */
  wizardRoomOpenCost: 10,
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
