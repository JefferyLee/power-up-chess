// Online-game archive: per-player history + a GLOBAL games collection.
//
// The flat rooms/{roomId} collection has no per-player or global index,
// so every finished room is mirrored into:
//   guests/{normalizedName}/games/{roomId}   — a player's Match history
//   games/{roomId}                            — the global Hall of Games
// (only online games exist as rooms; local / AI games never touch the
// server). Writes are server-only — clients read via the callables
// below, which run on the Admin SDK and bypass the default-deny rules.
//
// Privacy note: online rooms are already semi-public (spectating works
// off a shared room id), so surfacing finished online games to other
// signed-in guests is consistent with that model. This stores only what
// a spectator could already have seen.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { Chess } from 'chess.js'
import type { RoomDoc } from './types'

export interface ArchivedGame {
  roomId: string
  playedAt: number
  whiteName: string
  blackName: string
  result: 'white' | 'black' | 'draw'
  endReason: NonNullable<RoomDoc['endReason']>
  moveCount: number
  hostId: 'lucy' | 'luca'
}

/** Per-side classification tally from a review-time engine analysis. */
export interface SideCounts {
  brilliant: number
  best: number
  excellent: number
  good: number
  inaccuracy: number
  mistake: number
  blunder: number
}

/** Engine-derived game-quality summary, persisted onto the global game
 *  doc the first time anyone reviews it. `flaws` and `brilliancies` are
 *  the sort keys for the "cleanest" / "brilliant" archive views. */
export interface GameAnalysisSummary {
  v: number
  depth: number
  analyzedAt: number
  flaws: number         // both sides: mistakes + blunders
  brilliancies: number  // both sides: brilliant moves
  white: SideCounts
  black: SideCounts
}

/** The host's post-game "story" recap (the same single engine-backed
 *  LLM call shown live in review), persisted so the archive can show
 *  it without re-spending an LLM call. */
export interface GameRecap {
  host: 'lucy' | 'luca'
  text: string
  savedAt: number
}

/** The global-archive shape: an ArchivedGame plus a normalized-name
 *  array for per-player filtering, an optional engine analysis, and an
 *  optional host recap. */
export interface GlobalGame extends ArchivedGame {
  players: string[]
  analysis?: GameAnalysisSummary
  recap?: GameRecap
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Mirror a finished room into both players' subcollections AND the
 *  global games collection. Idempotent: the room id is the doc id, so
 *  a re-fired trigger (or the backfill) just rewrites the same records.
 *  Independent of the rating transaction — archives even when a side is
 *  a bypass guest (no rating change). */
export async function archiveFinishedGame(roomId: string, after: RoomDoc): Promise<void> {
  if (!after.result || !after.black) return
  const whiteName = normalizeName(after.white.displayName)
  const blackName = normalizeName(after.black.displayName)
  if (!whiteName || !blackName) return

  const record: ArchivedGame = {
    roomId,
    playedAt: after.updatedAt,
    whiteName: after.white.displayName,
    blackName: after.black.displayName,
    result: after.result,
    endReason: after.endReason ?? 'other',
    moveCount: after.moves.length,
    hostId: after.hostMode,
  }
  const global: GlobalGame = {
    ...record,
    players: whiteName === blackName ? [whiteName] : [whiteName, blackName],
  }

  const db = getFirestore()
  // merge:true on the global doc so a re-archive never clobbers an
  // `analysis` field a later phase may have written.
  const writes = [
    db.collection('games').doc(roomId).set(global, { merge: true }),
    db.collection('guests').doc(whiteName).collection('games').doc(roomId).set(record),
  ]
  // Don't duplicate when both sides normalise to the same name (shouldn't
  // happen for a real game, but guard anyway).
  if (blackName !== whiteName) {
    writes.push(
      db.collection('guests').doc(blackName).collection('games').doc(roomId).set(record),
    )
  }
  await Promise.all(writes)
}

// ── Read callables ──────────────────────────────────────────────────

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50

export interface GetPlayerGamesRequest {
  normalizedName: string
  limit?: number
}
export interface GetPlayerGamesResponse {
  games: ArchivedGame[]
}

export const getPlayerGames = onCall<GetPlayerGamesRequest, Promise<GetPlayerGamesResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const name = normalizeName(req.data?.normalizedName ?? '')
    if (!name) throw new HttpsError('invalid-argument', 'normalizedName required.')
    const limit = Math.min(MAX_LIMIT, Math.max(1, req.data?.limit ?? DEFAULT_LIMIT))

    const db = getFirestore()
    const snap = await db
      .collection('guests').doc(name).collection('games')
      .orderBy('playedAt', 'desc')
      .limit(limit)
      .get()
    return { games: snap.docs.map((d) => d.data() as ArchivedGame) }
  },
)

export interface GetRoomGameRequest {
  roomId: string
}
export type GetRoomGameResponse =
  | { ok: true; pgn: string; hostId: 'lucy' | 'luca'; whiteName: string; blackName: string }
  | { ok: false }

export const getRoomGame = onCall<GetRoomGameRequest, Promise<GetRoomGameResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const roomId = (req.data?.roomId ?? '').trim()
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')

    const db = getFirestore()
    const snap = await db.collection('rooms').doc(roomId).get()
    if (!snap.exists) return { ok: false }
    const room = snap.data() as RoomDoc
    if (!room.moves || room.moves.length === 0) return { ok: false }

    // Rebuild a canonical PGN from the stored SAN list. Seed from the
    // first move's fenBefore so an (unlikely) non-standard start still
    // replays; standard starts produce a plain movetext PGN.
    const startFen = room.moves[0]?.fenBefore
    const chess = startFen ? new Chess(startFen) : new Chess()
    chess.header('White', room.white.displayName)
    chess.header('Black', room.black?.displayName ?? 'Opponent')
    try {
      for (const m of room.moves) chess.move(m.san)
    } catch (err) {
      console.error('getRoomGame: PGN rebuild failed', roomId, err)
      return { ok: false }
    }
    return {
      ok: true,
      pgn: chess.pgn(),
      hostId: room.hostMode,
      whiteName: room.white.displayName,
      blackName: room.black?.displayName ?? 'Opponent',
    }
  },
)

// ── Global Hall of Games ────────────────────────────────────────────

const BROWSE_DEFAULT = 30
const BROWSE_MAX = 50

export type BrowseSort = 'recent' | 'cleanest' | 'brilliant'

export interface BrowseGamesRequest {
  sort?: BrowseSort
  limit?: number
  /** playedAt of the last row from the previous page. Only the 'recent'
   *  view paginates; the curated lists return a single top-N page. */
  cursorPlayedAt?: number
}
export interface BrowseGamesResponse {
  games: GlobalGame[]
  nextCursor: number | null
}

/** Curated lists ignore very short games (a 3-move miniature is a
 *  meaningless "cleanest" winner). */
const MIN_MOVES_FOR_CURATED = 8

export const browseGames = onCall<BrowseGamesRequest, Promise<BrowseGamesResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const limit = Math.min(BROWSE_MAX, Math.max(1, req.data?.limit ?? BROWSE_DEFAULT))
    const sort = req.data?.sort ?? 'recent'
    const db = getFirestore()

    if (sort === 'cleanest' || sort === 'brilliant') {
      // Only analyzed games carry these fields, so orderBy implicitly
      // excludes un-reviewed games. Over-fetch, drop tiny games, slice.
      let q =
        sort === 'cleanest'
          ? db.collection('games').orderBy('analysis.flaws', 'asc')
          : db.collection('games')
              .where('analysis.brilliancies', '>', 0)
              .orderBy('analysis.brilliancies', 'desc')
      q = q.limit(limit + 30)
      const snap = await q.get()
      const games = snap.docs
        .map((d) => d.data() as GlobalGame)
        .filter((g) => g.moveCount >= MIN_MOVES_FOR_CURATED)
        .slice(0, limit)
      return { games, nextCursor: null }
    }

    // recent
    let q = db.collection('games').orderBy('playedAt', 'desc')
    if (typeof req.data?.cursorPlayedAt === 'number') {
      q = q.startAfter(req.data.cursorPlayedAt)
    }
    const snap = await q.limit(limit).get()
    const games = snap.docs.map((d) => d.data() as GlobalGame)
    const last = games[games.length - 1]
    return {
      games,
      nextCursor: games.length === limit && last ? last.playedAt : null,
    }
  },
)

// ── Persist review-time analysis (Phase 2) ──────────────────────────
//
// Any authed client that finishes reviewing a game uploads its engine
// summary; the doc is keyed by room id so re-reviews just overwrite an
// identical (deterministic, depth-14) result. Engine facts only — the
// server sanity-checks the move tally against the stored game so a
// client can't fabricate a "flawless" entry to top the leaderboard.

export interface SaveGameAnalysisRequest {
  roomId: string
  analysis: {
    depth: number
    white: SideCounts
    black: SideCounts
  }
}

const COUNT_KEYS: Array<keyof SideCounts> = [
  'brilliant', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder',
]

function sanitizeSide(raw: unknown): SideCounts {
  const r = (raw ?? {}) as Record<string, unknown>
  const out = {} as SideCounts
  for (const k of COUNT_KEYS) {
    const n = Number(r[k])
    out[k] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  }
  return out
}

function sideTotal(s: SideCounts): number {
  return COUNT_KEYS.reduce((sum, k) => sum + s[k], 0)
}

export const saveGameAnalysis = onCall<SaveGameAnalysisRequest, Promise<{ ok: boolean }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const roomId = (req.data?.roomId ?? '').trim()
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')

    const db = getFirestore()
    const ref = db.collection('games').doc(roomId)
    const snap = await ref.get()
    if (!snap.exists) return { ok: false }
    const game = snap.data() as GlobalGame

    const white = sanitizeSide(req.data?.analysis?.white)
    const black = sanitizeSide(req.data?.analysis?.black)
    // Every move is classified exactly once, so the tally must match the
    // stored move count. Reject anything else as malformed / forged.
    if (sideTotal(white) + sideTotal(black) !== game.moveCount) {
      throw new HttpsError('invalid-argument', 'Analysis does not match the game.')
    }
    const depth = Math.max(1, Math.min(40, Math.floor(Number(req.data?.analysis?.depth) || 14)))

    const analysis: GameAnalysisSummary = {
      v: 1,
      depth,
      analyzedAt: Date.now(),
      flaws: white.mistake + white.blunder + black.mistake + black.blunder,
      brilliancies: white.brilliant + black.brilliant,
      white,
      black,
    }
    await ref.set({ analysis }, { merge: true })
    return { ok: true }
  },
)

// ── Persist the host recap (Phase 3) ────────────────────────────────
//
// Stores the post-game host "story" onto the archived game so the Hall
// of Games can show it. The recap is the exact engine-backed text the
// reviewer already saw live (gameRecap is honesty-constrained + cached
// server-side), so persisting it ships no new unreviewed content.

const RECAP_MAX_LEN = 1500

export interface SaveGameRecapRequest {
  roomId: string
  host: 'lucy' | 'luca'
  text: string
}

export const saveGameRecap = onCall<SaveGameRecapRequest, Promise<{ ok: boolean }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const roomId = (req.data?.roomId ?? '').trim()
    const host = req.data?.host
    const text = (req.data?.text ?? '').trim()
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    if (host !== 'lucy' && host !== 'luca') {
      throw new HttpsError('invalid-argument', 'host must be lucy or luca.')
    }
    if (!text || text.length > RECAP_MAX_LEN) {
      throw new HttpsError('invalid-argument', 'text missing or too long.')
    }

    const db = getFirestore()
    const ref = db.collection('games').doc(roomId)
    if (!(await ref.get()).exists) return { ok: false }
    const recap: GameRecap = { host, text, savedAt: Date.now() }
    await ref.set({ recap }, { merge: true })
    return { ok: true }
  },
)

// ── One-off backfill (admin only) ───────────────────────────────────
//
// Populates the global + per-player archives from every already-
// completed room. Idempotent (room id keys every doc), so it can be
// re-run safely. Paginates rooms by document id to bound memory.

const ADMIN_NORMALIZED_NAME = 'jeff'

export interface BackfillGameArchiveResponse {
  scanned: number
  archived: number
}

export const backfillGameArchive = onCall<unknown, Promise<BackfillGameArchiveResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const db = getFirestore()
    // Admin gate: caller must be signed into the jeff guest doc.
    const adminSnap = await db.collection('guests').doc(ADMIN_NORMALIZED_NAME).get()
    const uids = (adminSnap.data() as { uids?: string[] } | undefined)?.uids ?? []
    if (!uids.includes(req.auth.uid)) {
      throw new HttpsError('permission-denied', 'Admin only.')
    }

    let scanned = 0
    let archived = 0
    let lastId: string | null = null
    // Page through ALL rooms by id; filter to completed in memory (a
    // status index isn't worth adding for a one-off).
    for (;;) {
      let q = db.collection('rooms').orderBy('__name__').limit(200)
      if (lastId) q = q.startAfter(lastId)
      const snap = await q.get()
      if (snap.empty) break
      for (const doc of snap.docs) {
        scanned++
        lastId = doc.id
        const room = doc.data() as RoomDoc
        if (room.status !== 'completed' || !room.result || !room.black) continue
        try {
          await archiveFinishedGame(doc.id, room)
          archived++
        } catch (err) {
          console.error('backfill: failed for room', doc.id, err)
        }
      }
      if (snap.size < 200) break
    }
    return { scanned, archived }
  },
)
