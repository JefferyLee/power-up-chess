// Read-only profile lookup for the User Card popover.
//
// The Firestore rule on guests/{name} only permits a user to read their
// OWN doc (uids contains caller). Without this callable the Hall's
// "click someone's name to see their profile" UX would need a schema
// change to expose a public mirror — overkill for the handful of
// fields we want to share.
//
// What we return is a deliberately small subset of the GuestDoc plus a
// peek into the user's current presence so the spectator button can
// link straight to whatever room they're in. NEVER returns magic-word
// hashes, uids, IP, full puzzle stats, or anything that could enable
// tracking / harassment beyond what the OnlineList already shows.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc, TitleRank } from './types'
import { titleFor } from './types'
import type { LocationTag, PresenceDoc } from './chatTypes'

const PRESENCE_FRESH_MS = 45_000 // matches the heartbeat cadence + a little slack

export interface GetPublicProfileRequest {
  normalizedName: string
}

export interface GetPublicProfileResponse {
  displayName: string
  normalizedName: string
  /** Live lifetime-earn title (null below the apprentice threshold). */
  title: TitleRank | null
  castlePoints: number
  lifetimeEarned: number
  /** Number of distinct puzzles solved (best-attempt across history).
   *  0 if the user has never solved one. */
  puzzlesSolved: number
  /** Active cosmetics — affect avatar styling in the card. */
  hasHalo: boolean
  hasCrown: boolean
  hasTournamentCrown: boolean
  hostId: 'lucy' | 'luca'
  /** Where the user is right now (from their most recent presence ping).
   *  null if they're not currently online. */
  currentLocation: LocationTag | null
  /** True if the user is currently in a chess or wizard room — drives
   *  the "Invite" button's disabled state at the call site. */
  inGame: boolean
  // ── MVP3-P1 stats for the Adventurer's Plaque ──
  /** Live chess Elo. null until the user finishes their first rated online game. */
  chessRating: number | null
  /** Most recent Elo delta (signed). null if no game yet. */
  chessRatingDelta: number | null
  /** Rated online chess games played. */
  chessGames: number
  /** Aggregate puzzle ELO (max across plots, or null). */
  bestPuzzleRating: number | null
  /** Per-plot puzzle ELO snapshot — keys are plot ids, values are ratings. */
  puzzleRatings: Record<string, number>
  /** AI-practice + local-board match counts. Write side TODO — `null`
   *  when not yet tracked so the plaque renders "—". */
  matchesAi: number | null
  matchesLocal: number | null
  /** Tournament history. Write side TODO. */
  tournamentsEntered: number | null
  tournamentsBestPlacement: number | null
  /** Library stats. Write side TODO. */
  booksRead: number | null
  quizCorrect: number | null
  quizAttempted: number | null
  /** Currently-equipped piece-set id (used to render mini-pieces on the plaque). */
  equippedPieceSet: string | null
}

export const getPublicProfile = onCall<
  GetPublicProfileRequest,
  Promise<GetPublicProfileResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to view profiles.')
  }
  const normalized = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'normalizedName is required.')
  }

  const db = getFirestore()
  const guestSnap = await db.doc(`guests/${normalized}`).get()
  if (!guestSnap.exists) {
    throw new HttpsError('not-found', 'That guest doesn\'t exist.')
  }
  const guest = guestSnap.data() as GuestDoc

  // Most-recent presence — multiple sessions can exist (tab + phone),
  // pick the freshest one as "where they are now".
  const presenceQuery = await db
    .collection('lobby/presence/items')
    .where('normalizedName', '==', normalized)
    .get()
  const now = Date.now()
  let freshest: PresenceDoc | null = null
  for (const d of presenceQuery.docs) {
    const p = d.data() as PresenceDoc
    if (now - p.lastSeenAt > PRESENCE_FRESH_MS) continue
    if (!freshest || p.lastSeenAt > freshest.lastSeenAt) freshest = p
  }

  const currentLocation = freshest?.location ?? null
  const inGame = currentLocation?.kind === 'chess' || currentLocation?.kind === 'wizard'

  // The presence doc resolves cosmetic flags by checking each expiry
  // against the current ts; if the user is offline we recompute the same
  // way so the User Card still shows the right halo / crown.
  const now2 = Date.now()
  const cosmetics = guest.cosmetics ?? {}
  const hasHalo = freshest?.hasHalo
    ?? ((cosmetics.duelWinnerExpiresAt ?? 0) > now2)
  const hasCrown = freshest?.hasCrown
    ?? ((cosmetics.winStreakCrownExpiresAt ?? 0) > now2)
  const hasTournamentCrown = freshest?.hasTournamentCrown
    ?? ((cosmetics.tournamentCrownExpiresAt ?? 0) > now2)

  const puzzleRatings: Record<string, number> = {}
  let bestPuzzleRating: number | null = null
  if (guest.puzzleRatings) {
    for (const [plot, r] of Object.entries(guest.puzzleRatings)) {
      if (typeof r === 'number') {
        puzzleRatings[plot] = r
        if (bestPuzzleRating === null || r > bestPuzzleRating) bestPuzzleRating = r
      }
    }
  }

  return {
    displayName: guest.displayName,
    normalizedName: normalized,
    title: titleFor(guest.lifetimeEarned ?? 0),
    castlePoints: guest.castlePoints ?? 0,
    lifetimeEarned: guest.lifetimeEarned ?? 0,
    puzzlesSolved: guest.puzzleStats?.solved ?? 0,
    hasHalo,
    hasCrown,
    hasTournamentCrown,
    hostId: freshest?.hostId ?? 'lucy',
    currentLocation,
    inGame,
    chessRating: typeof guest.chessRating === 'number' ? guest.chessRating : null,
    chessRatingDelta: typeof guest.chessRatingDelta === 'number' ? guest.chessRatingDelta : null,
    chessGames: guest.chessGames ?? 0,
    bestPuzzleRating,
    puzzleRatings,
    matchesAi: typeof guest.matchesAi === 'number' ? guest.matchesAi : null,
    matchesLocal: typeof guest.matchesLocal === 'number' ? guest.matchesLocal : null,
    tournamentsEntered: typeof guest.tournamentsEntered === 'number' ? guest.tournamentsEntered : null,
    tournamentsBestPlacement: typeof guest.tournamentsBestPlacement === 'number' ? guest.tournamentsBestPlacement : null,
    booksRead: typeof guest.booksRead === 'number' ? guest.booksRead : null,
    quizCorrect: typeof guest.quizCorrect === 'number' ? guest.quizCorrect : null,
    quizAttempted: typeof guest.quizAttempted === 'number' ? guest.quizAttempted : null,
    equippedPieceSet: guest.cosmetics?.pieceSet ?? null,
  }
})
