// syncDeviceGame — upload a finished LOCAL or AI-practice game to the
// caller's guest archive (Phase 3.4), so "my games" follow the account
// across devices. Online games are archived server-side on completion;
// this covers the two device-only modes.
//
// The synced doc lives at guests/{name}/games/{id} in the same ArchivedGame
// shape getPlayerGames already returns, plus mode + pgn so any device can
// review it directly. forgetMe deletes the whole subcollection already.
//
// Since 2026-10-12 this is also where a Local / AI win is PAID: the
// record and the castle-point settlement land in one transaction, so a
// win claim must come with the game itself. The PGN has to parse, and a
// claimed checkmate has to be on the board; resign / timeout wins can't be
// proven from the moves and ride on the daily chessWin cap instead.

import { Chess } from 'chess.js'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import { bumpAndCheck } from '../castle/chatRateLimit'
import { extractIp } from '../castle/ipGeo'
import { requireOwnedGuest } from '../castle/requireOwner'
import { settleAwardTx } from '../castle/settleAward'
import { AWARD_CAPS, type AwardCastlePointsResponse, type AwardSource, type ChessOpponent } from '../castle/types'
import type { ArchivedGame } from './playerGames'

const MAX_PGN_CHARS = 20_000
const SYNCS_PER_DAY = 100
const ID_RE = /^(local|ai):[A-Za-z0-9-]{4,64}$/
const RESULTS = new Set(['white', 'black', 'draw'])
const END_REASONS = new Set([
  'checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition',
  'fifty_move', 'resign', 'timeout', 'other',
])

export interface SyncDeviceGameRequest {
  id: string
  playedAt: number
  mode: 'local' | 'ai'
  whiteName: string
  blackName: string
  hostId: 'lucy' | 'luca'
  result: 'white' | 'black' | 'draw'
  endReason: string
  pgn: string
  moveCount: number
  aiDifficulty?: string
  /** Which side the guest played (AI games). Needed to tell a win from a loss. */
  playerColor?: 'white' | 'black'
}
export interface SyncDeviceGameResponse {
  ok: boolean
  /** The chess-win settlement for this game, null when it was not a
   *  payable win (loss, draw, unsupported PGN) — `added` is 0 on a replay. */
  award: AwardCastlePointsResponse | null
}

/** Does the PGN back a win for `winner`? It must parse to a real game,
 *  and a claimed checkmate must be on the board with the loser to move. */
export function pgnSupportsWin(pgn: string, winner: 'white' | 'black', endReason: string): boolean {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    return false
  }
  if (chess.history().length < 2) return false
  if (endReason !== 'checkmate') return true
  return chess.isCheckmate() && chess.turn() === (winner === 'white' ? 'b' : 'w')
}

export const syncDeviceGame = onCall<SyncDeviceGameRequest, Promise<SyncDeviceGameResponse>>(APP_CHECK,async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const d = req.data ?? ({} as SyncDeviceGameRequest)

  if (!ID_RE.test(String(d.id ?? ''))) throw new HttpsError('invalid-argument', 'Bad game id.')
  if (d.mode !== 'local' && d.mode !== 'ai') throw new HttpsError('invalid-argument', 'Bad mode.')
  if (!RESULTS.has(String(d.result))) throw new HttpsError('invalid-argument', 'Bad result.')
  const endReason = END_REASONS.has(String(d.endReason)) ? String(d.endReason) : 'other'
  const pgn = String(d.pgn ?? '')
  if (!pgn || pgn.length > MAX_PGN_CHARS) throw new HttpsError('invalid-argument', 'Bad pgn.')
  const hostId = d.hostId === 'luca' ? 'luca' : 'lucy'

  const db = getFirestore()
  const idSnap = await db.doc(`chat_identity/${uid}`).get()
  const idData = idSnap.data() as { normalizedName: string; isBypass: boolean } | undefined
  if (!idData || idData.isBypass || !idData.normalizedName) {
    throw new HttpsError('failed-precondition', 'Sign in with a magic word to sync games.')
  }
  await requireOwnedGuest(db, uid, idData.normalizedName)

  const gate = await bumpAndCheck(uid, 'sync-day', SYNCS_PER_DAY)
  if (!gate.allowed) throw new HttpsError('resource-exhausted', 'Sync limit reached for today.')

  const record: ArchivedGame = {
    roomId: d.id,
    playedAt: typeof d.playedAt === 'number' && d.playedAt > 0 ? d.playedAt : Date.now(),
    whiteName: String(d.whiteName ?? '').slice(0, 32) || 'White',
    blackName: String(d.blackName ?? '').slice(0, 32) || 'Black',
    result: d.result,
    endReason: endReason as ArchivedGame['endReason'],
    moveCount: Math.max(0, Math.min(1000, Number(d.moveCount) || 0)),
    hostId,
    mode: d.mode,
    pgn,
    ...(d.aiDifficulty ? { aiDifficulty: String(d.aiDifficulty).slice(0, 20) } : {}),
  }
  // Local: any decisive result is "your" win (both players share the
  // screen). AI: only the guest's own colour. The opponent tier scales the
  // award; an unknown tier pays the legacy flat rate.
  const winner = d.result === 'white' || d.result === 'black' ? d.result : null
  const playerWon = winner !== null && (d.mode === 'local' || d.playerColor === winner)
  let awardSource: AwardSource | null = null
  if (winner && playerWon && pgnSupportsWin(pgn, winner, endReason)) {
    const tier = `ai-${String(d.aiDifficulty ?? '')}`
    awardSource = d.mode === 'ai' && tier in AWARD_CAPS.chessWinByOpponent
      ? { source: 'chess-win', gameId: d.id, opponent: tier as ChessOpponent }
      : { source: 'chess-win', gameId: d.id }
  }

  const name = idData.normalizedName
  const ip = extractIp(req)
  // Idempotent by id — replaying the sync after a retry rewrites the same
  // record and settleAwardTx finds its marker (added 0).
  const award = await db.runTransaction(async (tx) => {
    const { guest } = await requireOwnedGuest(db, uid, name, tx)
    const paid = awardSource
      ? await settleAwardTx(tx, db, name, guest, awardSource, { uid, ...(ip ? { ip } : {}) })
      : null
    tx.set(db.doc(`guests/${name}/games/${d.id}`), record)
    return paid
  })
  return { ok: true, award }
})
