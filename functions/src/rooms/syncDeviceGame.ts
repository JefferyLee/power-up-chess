// syncDeviceGame — upload a finished LOCAL or AI-practice game to the
// caller's guest archive (Phase 3.4), so "my games" follow the account
// across devices. Online games are archived server-side on completion;
// this covers the two device-only modes.
//
// The synced doc lives at guests/{name}/games/{id} in the same ArchivedGame
// shape getPlayerGames already returns, plus mode + pgn so any device can
// review it directly. forgetMe deletes the whole subcollection already.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import { bumpAndCheck } from '../castle/chatRateLimit'
import type { GuestDoc } from '../castle/types'
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
}
export interface SyncDeviceGameResponse {
  ok: boolean
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
  const guestSnap = await db.doc(`guests/${idData.normalizedName}`).get()
  const guest = guestSnap.data() as GuestDoc | undefined
  if (!guest || !guest.uids.includes(uid)) {
    throw new HttpsError('permission-denied', 'You can only sync your own games.')
  }

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
  // Idempotent by id — replaying the sync after a retry is harmless.
  await db.collection('guests').doc(idData.normalizedName).collection('games').doc(d.id).set(record)
  return { ok: true }
})
