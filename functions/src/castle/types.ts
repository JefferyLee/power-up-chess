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
    }
  | {
      status: 'returning'
      displayName: string
      castlePoints: number
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
