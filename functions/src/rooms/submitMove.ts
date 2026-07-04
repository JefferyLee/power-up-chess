import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { applyMove, type ApplyMoveOutcome, type RejectCode } from './applyMove'
import { parseUci } from './parseUci'
import type { RoomDoc, SubmitMoveRequest, SubmitMoveResponse } from './types'

/**
 * Server-authoritative move submission.
 *
 * Every move passes through here so chess.js is the single source of truth
 * for legality. The client cannot fake an illegal move, and cannot move out
 * of turn. The validation itself lives in the pure `applyMove` (unit-tested);
 * this wrapper owns the transaction, the write, and the HttpsError mapping.
 */
export const submitMove = onCall<SubmitMoveRequest, Promise<SubmitMoveResponse>>({ enforceAppCheck: false },async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before submitting a move.')
  }
  const { roomId, moveIndex, uci, clientTs } = req.data
  if (typeof roomId !== 'string' || !/^[A-Za-z0-9]{4,12}$/.test(roomId)) {
    throw new HttpsError('invalid-argument', 'Invalid room id.')
  }
  if (typeof moveIndex !== 'number' || moveIndex < 0 || !Number.isInteger(moveIndex)) {
    throw new HttpsError('invalid-argument', 'Invalid moveIndex.')
  }
  const parsed = parseUci(uci)
  if (!parsed) {
    throw new HttpsError('invalid-argument', 'Invalid uci.')
  }

  const uid = req.auth.uid
  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  // The outcome decides what (if anything) gets written. Rejections throw
  // AFTER the transaction so a timeout flag actually commits — throwing
  // inside runTransaction would abort the write.
  const outcome: ApplyMoveOutcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
    const room = snap.data() as RoomDoc
    const result = applyMove(room, {
      moveIndex,
      parsed,
      uid,
      ...(typeof clientTs === 'number' ? { clientTs } : {}),
      now: Date.now(),
    })
    if (result.kind === 'ok' || result.kind === 'flagged') {
      tx.set(ref, result.updated)
    }
    return result
  })

  if (outcome.kind === 'flagged') {
    throw new HttpsError('failed-precondition', 'Your time ran out.')
  }
  if (outcome.kind === 'reject') {
    throw new HttpsError(ERROR_CODE[outcome.code], outcome.message)
  }
  return { ok: true, moveIndex, fenAfter: outcome.fenAfter }
})

/** Same HttpsError codes the pre-extraction implementation used. */
const ERROR_CODE: Record<RejectCode, 'failed-precondition' | 'aborted' | 'internal' | 'permission-denied' | 'invalid-argument'> = {
  'not-live': 'failed-precondition',
  'no-black': 'failed-precondition',
  'out-of-sync': 'aborted',
  'corrupt-history': 'internal',
  'not-your-turn': 'permission-denied',
  illegal: 'invalid-argument',
}
