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
      castlePoints: number
      decayedBy: 0
      pointsBeforeDecay: 0
      /** Phase C: the starter pack + (optional) future bonuses on first visit. */
      bonus?: EnterBonus
    }
  | {
      status: 'returning'
      displayName: string
      castlePoints: number
      /** Points lost to decay this visit (§7.4). 0 if same day. */
      decayedBy: number
      /** Castle points before decay was applied. Equal to `castlePoints + decayedBy`. */
      pointsBeforeDecay: number
      /** Phase C: bundled check-in + streak bonus, if any fired this visit. */
      bonus?: EnterBonus
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

/** Optional bonus block returned by castleEnter. Any combination of the
 *  three sources can fire on one visit (e.g. brand-new + first-of-day +
 *  hitting day 7 → all three). Client surfaces a single combined toast. */
export interface EnterBonus {
  starter?: number
  checkIn?: number
  streak?: number
  /** Current streak day count after this visit. */
  streakDays?: number
  /** Sum of all the above — handy for the toast headline. */
  total: number
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
  // ── Phase C: time-based earning ──────────────────────────────────────
  /** Awarded on the first castleEnter of a new calendar day. */
  checkInDaily: 2,
  /** Awarded on top of check-in every multiple of streakDaysRequired. */
  streakBonus: 20,
  streakDaysRequired: 7,
  /** Awarded once, on the first castleEnter of a brand-new account. */
  newAccountStarter: 30,
  // ── Phase C: anti-grinding daily caps per source per guest ───────────
  /** Generous puzzle cap — encourages many puzzles before headroom
   *  shrinks. ~10-20 solid solves at average tier before the cap hits. */
  puzzleDailyMax: 150,
  /** Two top-tier AI wins / two human wins worth of headroom per day. */
  chessWinDailyMax: 80,
  /** One generous post-game review per day (per-review cap is already 80). */
  chessReviewDailyMax: 100,
  /** Forest Adventure tier table — payout in castle points per run, by
   *  end-of-run score. Capped daily by forestDailyMax. */
  forestTiers: [
    { minScore:   0, pt:  0 },
    { minScore:  20, pt:  5 },
    { minScore:  50, pt: 10 },
    { minScore:  90, pt: 18 },
    { minScore: 140, pt: 30 },
  ] as const,
  forestDailyMax: 30,
} as const

export const UNLOCK_THRESHOLD = 200

// ─── Public stats ──────────────────────────────────────────────────────────

export interface CastlePublicStats {
  activeToday: number
  topGuests: TopGuest[]
  /** Server ts when this doc was last rebuilt. */
  refreshedAt: number
}

export interface TopGuest {
  displayName: string
  castlePoints: number
  /** Lifetime-earn title label at refresh time ("Apprentice", etc.). */
  title?: string
  /** Has an active duel-winner halo (last 24 h). */
  hasHalo?: boolean
  /** Has an active 3-win streak crown (last 72 h). Overrides halo visually. */
  hasCrown?: boolean
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
  /** Time-limited cosmetic effects active on the guest's name/avatar.
   *  Currently just the post-duel-win golden halo. */
  cosmetics?: GuestCosmetics
  /** Phase C — floor(now/DAY_MS) of the last check-in bonus claim. Used
   *  to gate the daily +2 pt to once per calendar day. */
  lastCheckInDayKey?: number
  /** Consecutive-day check-in count. Resets to 1 on a >1-day gap; on
   *  every multiple of AWARD_CAPS.streakDaysRequired the streak bonus
   *  fires on top of the daily check-in. */
  streakDays?: number
  /** Today's per-source earnings, used to enforce daily caps without
   *  bloating the doc. Replaced whole-cloth when the day rolls over. */
  dailyEarn?: GuestDailyEarn
  /** Phase D — sum of every positive castle-point credit this guest has
   *  ever received. Only ever goes up; drives the lifetime-earn title
   *  ladder (Apprentice / Adept / Sorcerer / Archmage). Missing = treated
   *  as max(0, current castlePoints) on first read (lazy migration). */
  lifetimeEarned?: number
}

export interface GuestDailyEarn {
  /** floor(now / DAY_MS). When this differs from today's key the bucket
   *  is treated as empty and lazily replaced on the next award. */
  dayKey: number
  puzzle: number
  chessWin: number
  chessReview: number
  /** Phase E — Forest Adventure castle-point payout this day. */
  forest?: number
}

export interface GuestCosmetics {
  /** Server-ms when the duel-winner halo expires; absent / past = no halo. */
  duelWinnerExpiresAt?: number
  /** Consecutive Wizard's Duel wins (reset on any loss). Once it hits
   *  CROWN_THRESHOLD the winStreakCrownExpiresAt is set/extended. */
  winStreak?: number
  /** Server-ms when the 3-win-streak crown expires; absent / past = no crown. */
  winStreakCrownExpiresAt?: number
}

/** Hours the duel-winner halo lasts after a Wizard's Duel victory. */
export const DUEL_HALO_HOURS = 24

/** Consecutive-wins needed to earn the streak crown cosmetic. */
export const CROWN_THRESHOLD = 3
/** Hours the streak crown lasts after each qualifying win. Each new
 *  win at or above CROWN_THRESHOLD pushes the expiry forward by this
 *  many hours from `now` (not from previous expiry). */
export const CROWN_HOURS = 72

// ── Lifetime-earn titles (Phase D) ──────────────────────────────────────
//
// lifetimeEarned is incremented every time a guest gets POSITIVE castle
// points (awards, duel payouts, starter pack, check-in/streak bonuses).
// Spending — chat costs, spell casts, room-open fees — does NOT subtract
// from lifetimeEarned; titles only ever go up.

export interface TitleRank {
  id: 'apprentice' | 'adept' | 'sorcerer' | 'archmage'
  label: string
  /** Minimum lifetimeEarned to display this title. */
  threshold: number
}

export const TITLE_LADDER: TitleRank[] = [
  { id: 'apprentice', label: 'Apprentice', threshold: 100 },
  { id: 'adept',      label: 'Adept',      threshold: 500 },
  { id: 'sorcerer',   label: 'Sorcerer',   threshold: 2000 },
  { id: 'archmage',   label: 'Archmage',   threshold: 10000 },
]

/** Resolve the highest-rank title for a given lifetime-earn total.
 *  Returns null when below the entry threshold. */
export function titleFor(lifetimeEarned: number): TitleRank | null {
  let best: TitleRank | null = null
  for (const rank of TITLE_LADDER) {
    if (lifetimeEarned >= rank.threshold) best = rank
  }
  return best
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
