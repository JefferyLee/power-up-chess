// Per-player online-game archive + read callables.
//
// The flat rooms/{roomId} collection has no per-player index, so to
// power a player's "Match history" on their plaque we mirror every
// finished room into BOTH players' subcollections:
//   guests/{normalizedName}/games/{roomId}
// (only online games ever exist as rooms; local / AI games never touch
// the server). Writes are server-only — clients read via the callables
// below, which run on the Admin SDK and bypass the default-deny rules.
//
// Privacy note: online rooms are already semi-public (spectating works
// off a shared room id), so surfacing a player's finished online games
// to other signed-in guests is consistent with that model. This stores
// only what a spectator could already have seen.

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

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Mirror a finished room into both players' game subcollections.
 *  Idempotent: the room id is the doc id, so a re-fired trigger just
 *  rewrites the same record. Independent of the rating transaction —
 *  archives even when a side is a bypass guest (no rating change). */
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

  const db = getFirestore()
  const writes = [
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
