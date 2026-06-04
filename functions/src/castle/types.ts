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
      /** H.7 — freshly-minted session token. Client stores + stamps on
       *  every subsequent server call; older devices for this same
       *  account get evicted because their stored sessionId is now stale. */
      sessionId: string
      /** Server-side cosmetics so the client can render the right
       *  piece-set on the first frame without trusting localStorage.
       *  Absent only when the guest has no cosmetics set yet. */
      cosmetics?: EnterCosmetics
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
      sessionId: string
      cosmetics?: EnterCosmetics
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

/** Snapshot of the persistent cosmetics state sent to the client on
 *  castleEnter. The plain `pieceSet` is the equipped id; bool flags
 *  let the client render halo / crown chips without a second read. */
export interface EnterCosmetics {
  /** Currently-equipped piece-set id. Defaults to 'classic' on the
   *  client when missing. */
  pieceSet?: string
  /** Set of piece-set ids the guest owns. Drives the shop's
   *  "purchased" badges immediately, without a second fetch. */
  ownedPieceSets?: string[]
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
  /** Min castlePoints to open or join a Wizard's Duel — the looser of
   *  WIZARD_ABSOLUTE_FLOOR (1000) and the rolling top-10% threshold,
   *  rounded down. Clients use this for the friendly "Earn X to unlock"
   *  message; the server still re-enforces in createWizardRoom + join. */
  wizardGateMinPoints?: number
}

/** Hard upper limit for the wizard gate — even if the community gets
 *  rich and top-10% climbs past this, anyone over 1000 still gets in. */
export const WIZARD_ABSOLUTE_FLOOR = 1000

export interface TopGuest {
  displayName: string
  /** Lookup key — used by client surfaces to open this guest's plaque
   *  via the UserCard / getPublicProfile callable. Missing on pre-2026
   *  stats docs; the client should fall through to a non-link. */
  normalizedName?: string
  castlePoints: number
  /** Lifetime-earn title label at refresh time ("Apprentice", etc.). */
  title?: string
  /** Has an active duel-winner halo (last 24 h). */
  hasHalo?: boolean
  /** Has an active 3-win streak crown (last 72 h). Overrides halo visually. */
  hasCrown?: boolean
  /** P2.H — Weekly Tournament champion crown (last 7 days). Highest
   *  priority of the three when rendering one marker per kid. */
  hasTournamentCrown?: boolean
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
  /** H.7 — single-active-session token. Re-minted on every castleEnter.
   *  setPresence / postChat refuse calls whose stamped sessionId no
   *  longer matches this; the stale client is told to sign out. */
  activeSessionId?: string
  /** Puzzles — per-plot ELO. Missing plot = treat as DEFAULT_RATING.
   *  See functions/src/puzzles/types.ts. */
  puzzleRatings?: Partial<Record<
    'mate' | 'fork' | 'pinSkewer' | 'sacrifice' | 'endgame' | 'defense',
    number
  >>
  /** True once the kid has completed (or skipped) calibration. */
  puzzleCalibrated?: boolean
  /** Rolling list of recently-served puzzle ids, newest last. Trimmed
   *  to SEEN_CAP to keep the doc small. Used to avoid serving the same
   *  puzzle twice in a short window. */
  puzzleSeen?: string[]
  /** Aggregate counters across all plots. */
  puzzleStats?: { solved: number; attempted: number }
  /** Per-plot rating snapshot taken at the start of the current ISO
   *  week (Monday 00:00 LA). The leaderboard "this week's climbers"
   *  list uses (puzzleRatings[plot] - puzzleWeekStarts[plot]) as the
   *  ranking key. Reset by refreshPuzzleLeaderboards on week rollover. */
  puzzleWeekStarts?: Partial<Record<
    'mate' | 'fork' | 'pinSkewer' | 'sacrifice' | 'endgame' | 'defense',
    number
  >>
  /** Today's Five — 5 hand-picked puzzles per LA day. Replaced when the
   *  day rolls over. results[i] = true (solved) / false (failed/skip) /
   *  null (not yet attempted). completionBonusPaid flips true after the
   *  +10 castle-point bonus fires on the 5th attempt. */
  puzzleDaily?: {
    dayKey: string                  // YYYY-MM-DD in LA
    puzzleIds: string[]             // length 5
    results: Array<boolean | null>  // length 5
    completionBonusPaid?: boolean
  }
  /** Legends Hall — puzzle ids the kid has solved in the 100-puzzle
   *  Legends pool. Drives the gold-badge plaques in the museum. */
  puzzleLegendsBadges?: string[]
  /** P2.K — endgame trainer progress, per lesson id. clearedPositions
   *  is the dedupe key for awarding POSITION_REWARD_PTS; lessonMasteredAt
   *  is set the first time every position in the lesson is cleared
   *  and triggers the one-time LESSON_MASTER_BONUS_PTS. */
  endgameProgress?: Partial<Record<string, {
    clearedPositions: string[]
    lessonMasteredAt?: number
  }>>
  /** P2.J — opening trainer progress, per opening id. Dedupe is by
   *  position INDEX (not content), so reordering positions in the
   *  client would re-award. lessonMasteredAt = first full sweep. */
  openingProgress?: Partial<Record<string, {
    clearedIndexes: number[]
    lessonMasteredAt?: number
  }>>
  /** This week's puzzle solve count, ISO-week-scoped (LA tz). Lazily
   *  reset to 1 on the first solve of a new weekKey. Used by the
   *  Weekly Tournament entry gate (50 solves/week per spec). */
  puzzleSolvesThisWeek?: {
    count: number
    weekKey: string
  }
  /** Today's puzzle solve count, LA-day-scoped. Lazily reset to 1 on
   *  the first solve of a new dayKey. Used by the gate's live pulse
   *  to surface top-solvers-today. */
  puzzleSolvesToday?: {
    count: number
    /** LA-day key, e.g. "2026-06-02". */
    dayKey: string
  }
  /** MVP3 — server ts when the kid finished the Chess Basics Tutorial
   *  (the last lesson). Reward fires once-ever; subsequent completions
   *  no-op. Drives the Hall tutorial card's "completed" state. */
  learnedBasicsAt?: number

  // ── MVP3-P1 Adventurer's Plaque fields ──────────────────────────────
  /** Live chess ELO. Default ELO_DEFAULT when missing. Updated by the
   *  onRoomFinished trigger after every finished online chess game. */
  chessRating?: number
  /** Last Elo delta (signed). Drives the "↑42 / ↓17" indicator on the
   *  plaque. Refreshed on every rated update. */
  chessRatingDelta?: number
  /** Number of rated online chess games — drives the K-factor in the
   *  Elo formula (K=32 for new players, K=16 after PROVISIONAL_GAMES). */
  chessGames?: number
  /** AI-practice match count (write side TODO — currently always missing). */
  matchesAi?: number
  /** Local-board (pass-and-play) match count (write side TODO). */
  matchesLocal?: number
  /** Tournaments registered for (write side TODO). */
  tournamentsEntered?: number
  /** Best (numerically smallest) podium finish ever — 1 = first place,
   *  2 = runner-up, etc. Missing = never placed. (Write side TODO.) */
  tournamentsBestPlacement?: number
  /** Library books read to completion. Mirrors booksReadIds.length so
   *  reads on the Adventurer's Plaque don't need to compute it. */
  booksRead?: number
  /** Distinct story ids the guest has opened or listened to. Dedupe key
   *  for booksRead — re-opening the same story doesn't double-count. */
  booksReadIds?: string[]
  /** Recently-interacted guests — capped, newest-first. Drives the
   *  "Recently played with" list on the Hall sidebar so offline kids
   *  whose plaques you care about are one tap away. Written by
   *  onRoomFinished (online chess) + respondInvite (on accept). */
  recentlyPlayedWith?: Array<{
    normalizedName: string
    displayName: string
    /** ms timestamp of the last interaction. */
    at: number
  }>
  /** Team membership — up to TEAM_PER_USER_MAX team ids. Plaque + Hall
   *  use these to render the team badges + sidebar entry. */
  teamIds?: string[]
  /** Correct story-quiz answers all-time (write side TODO). */
  quizCorrect?: number
  /** Total story-quiz attempts (write side TODO). */
  quizAttempted?: number
}

/** Cap for recentlyPlayedWith — newest 12 entries. Keeps the guest
 *  doc small while covering a couple weeks of casual play. */
export const RECENTLY_PLAYED_MAX = 12

// ─── Teams (MVP3-P3) ───────────────────────────────────────────────────
//
// Self-organised teams. Any guest can create one for TEAM_CREATE_COST_CP.
// Members cap at TEAM_MEMBER_MAX. A guest can be in at most TEAM_PER_USER_MAX
// teams at once. Captain is the creator; can transfer to any member or
// disband. If captain is offline > TEAM_CAPTAIN_TIMEOUT_DAYS the team
// auto-dissolves (cron sweep, separate file).

/** Cost in castle points to spin up a new team. Steep enough to
 *  prevent spam-creating; cheap enough that a kid who's saved up some
 *  puzzle wins can afford one. */
export const TEAM_CREATE_COST_CP = 100
/** Max members per team. Class-group sized; bigger groups need
 *  sub-structure that V1 doesn't have. */
export const TEAM_MEMBER_MAX = 20
/** Max teams a single guest can belong to simultaneously. */
export const TEAM_PER_USER_MAX = 2
/** Captain inactivity threshold — team auto-disbands if the captain
 *  hasn't called castleEnter in this many days. */
export const TEAM_CAPTAIN_TIMEOUT_DAYS = 30
/** Days an unanswered application sticks around before auto-expiring. */
export const TEAM_APPLICATION_TTL_DAYS = 7
/** Solo-team auto-disband threshold — when the team shrinks to just
 *  the captain AND no new applications/joins for this many days. */
export const TEAM_SOLO_DISBAND_DAYS = 14

/** Heraldry-style badge config. Stored on the team doc as a small
 *  JSON; rendered client-side as SVG so it scales to any size. Slice 4
 *  expands the builder; Slice 1 ships with a minimal stub (shape +
 *  background colour only). Older docs may have a smaller subset of
 *  fields — clients should default missing parts. */
export interface TeamBadge {
  /** Shield outline. 8 options as of slice 4. */
  shape?: string
  /** Background division: solid, per-pale, per-fess, per-bend,
   *  per-chevron, quartered, chief, bordure. */
  layout?: string
  /** Primary (background) colour. */
  bg?: string
  /** Secondary (for split layouts) colour. */
  bg2?: string
  /** Frame / border colour. */
  border?: string
  /** Centred symbol id (chess piece, animal, heraldic charge, etc). */
  symbol?: string
  /** Fill colour of the symbol. */
  symbolColor?: string
  /** Optional engraved motto / monogram. Server enforces:
   *    • ≤ TEAM_TEXT_MAX characters
   *    • [A-Z0-9 ] only (auto-uppercased)
   *    • profanity-scrubbed (any hit → field is dropped entirely
   *      rather than censored with asterisks, since asterisks on a
   *      shield look like a permanent shaming brand) */
  text?: string
  /** Where the text appears on the badge. */
  textPosition?: 'none' | 'chief' | 'base'
  /** Fill colour for engraved text. */
  textColor?: string
}

/** Max characters for engraved badge text. Anything longer is unreadable
 *  in a small inline render. */
export const TEAM_TEXT_MAX = 12

export interface TeamMember {
  normalizedName: string
  displayName: string
  joinedAt: number
}

export interface TeamDoc {
  /** Short random base36 id — drives /team/:id URLs. */
  teamId: string
  name: string
  /** Lower-cased + trimmed name — uniqueness key. */
  normalizedName: string
  /** Optional one-liner the captain sets ("We solve puzzles before bed"). */
  motto?: string
  badge: TeamBadge
  /** Captain's identity at the latest update. Captain is the only one
   *  who can rename / rebadge / approve / kick / transfer / disband
   *  the team. */
  captainUid: string
  captainNormalizedName: string
  captainDisplayName: string
  /** Newest-first roster. Captain is always in here too. */
  members: TeamMember[]
  /** Soft total — denormalised count for cheap rendering. */
  memberCount: number
  createdAt: number
  /** ms timestamp of the most recent member-changing event (join /
   *  leave / kick). Drives the 14-day solo-disband sweep. */
  lastChangeAt: number
  /** Rate-limit timestamps — last time the captain renamed, changed
   *  the badge, or posted a recruit broadcast (each capped to 1/week). */
  lastRenamedAt?: number
  lastRebadgedAt?: number
  lastRecruitAt?: number
}

/** Per-team application — stored as a top-level collection keyed by
 *  application id (uid-of-applicant + ":" + teamId). */
export interface TeamApplicationDoc {
  applicationId: string
  teamId: string
  fromUid: string
  fromNormalizedName: string
  fromDisplayName: string
  /** Optional one-liner from the applicant. */
  pitch?: string
  createdAt: number
  /** Server ts when this expires (createdAt + TEAM_APPLICATION_TTL_DAYS). */
  expiresAt: number
  status: 'pending' | 'approved' | 'declined' | 'expired'
}

/** Starting Elo for a brand-new player. Mid-beginner so a couple of
 *  wins against an early-rated peer feels good but not laughable. */
export const ELO_DEFAULT = 800
/** Number of rated games before the K-factor halves. Standard FIDE-style
 *  ramp-down — protects experienced players from giant single-game swings. */
export const ELO_PROVISIONAL_GAMES = 30
/** Higher K = faster movement. 32 for fresh accounts, 16 once seasoned. */
export const ELO_K_PROVISIONAL = 32
export const ELO_K_SEASONED = 16

/** One-time castle-point reward for finishing all 5 basics lessons. */
export const TUTORIAL_COMPLETE_REWARD = 50

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
  /** P1.D Theme Shop — currently-equipped piece-set id. Default 'classic'
   *  when missing. Validated against functions/src/cosmetics/registry. */
  pieceSet?: string
  /** Piece-set ids the guest has purchased. Free sets (classic, outline)
   *  are NOT stored here — they're always considered owned. */
  ownedPieceSets?: string[]
  /** P2.H — Weekly Tournament champion crown expiry (1 week after a
   *  win). Surfaced as a 🏆 badge in the tournament page + future
   *  Hall integration. */
  tournamentCrownExpiresAt?: number
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
