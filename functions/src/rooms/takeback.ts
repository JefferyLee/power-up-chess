// Takeback ("悔棋") — a paid, limited move undo.
//
// Cost escalates per use and each game allows at most three. Local and
// AI games charge through spendOnTakeback (the undo itself happens
// client-side). Online games never let one player rewrite the
// opponent's position unilaterally — a takeback is an OFFER the
// opponent must accept, and it only ever removes the requester's own
// last, un-answered move (so no opponent move is reverted). The charge
// lands when the opponent accepts.

import { Chess } from 'chess.js'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { requireOwnedGuest } from '../castle/requireOwner'
import { appendAuditTx } from '../castle/audit'
import type { RoomDoc } from './types'

type Color = 'w' | 'b'

export const TAKEBACK_COSTS = [100, 200, 800]
export const MAX_TAKEBACKS = TAKEBACK_COSTS.length

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Colour of the side that made the last move, or null if none. */
function lastMover(moveCount: number): Color | null {
  if (moveCount <= 0) return null
  return (moveCount - 1) % 2 === 0 ? 'w' : 'b'
}

// ── Local / AI: charge for a client-side undo ───────────────────────

export interface SpendOnTakebackRequest {
  normalizedName: string
  sessionId: string
  /** 1-based: which takeback this is (1 → 100, 2 → 200, 3 → 800). */
  index: number
}

export const spendOnTakeback = onCall<SpendOnTakebackRequest, Promise<{ castlePoints: number }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const name = normalizeName(req.data?.normalizedName ?? '')
    const sessionId = String(req.data?.sessionId ?? '').trim()
    const index = Number(req.data?.index)
    if (!name) throw new HttpsError('invalid-argument', 'normalizedName required.')
    if (!Number.isInteger(index) || index < 1 || index > MAX_TAKEBACKS) {
      throw new HttpsError('invalid-argument', 'No takebacks left.')
    }
    const cost = TAKEBACK_COSTS[index - 1]!

    const db = getFirestore()
    return db.runTransaction(async (tx) => {
      const { ref, guest } = await requireOwnedGuest(db, uid, name, tx, { sessionId })
      if (guest.castlePoints < cost) {
        throw new HttpsError('failed-precondition', `Not enough castle points (need ${cost}).`)
      }
      const after = guest.castlePoints - cost
      tx.update(ref, { castlePoints: after, lastVisitAt: Date.now() })
      appendAuditTx(tx, {
        normalizedName: name,
        uid,
        delta: -cost,
        before: guest.castlePoints,
        after,
        source: `takeback:${index}`,
        metadata: { index, cost },
      })
      return { castlePoints: after }
    })
  },
)

// ── Online: offer / accept ──────────────────────────────────────────

function callerColor(room: RoomDoc, uid: string): Color | null {
  if (room.white.playerId === uid) return 'w'
  if (room.black?.playerId === uid) return 'b'
  return null
}

export const requestTakeback = onCall<{ roomId: string }, Promise<{ ok: boolean }>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const roomId = (req.data?.roomId ?? '').trim()
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    const db = getFirestore()
    const ref = db.doc(`rooms/${roomId}`)

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = snap.data() as RoomDoc
      if (room.status !== 'live') throw new HttpsError('failed-precondition', 'Game is not live.')
      const color = callerColor(room, uid)
      if (!color) throw new HttpsError('permission-denied', 'You are not a player here.')

      const moves = room.moves ?? []
      // Only your own last, un-answered move can be taken back.
      if (lastMover(moves.length) !== color) {
        throw new HttpsError('failed-precondition', 'You can only take back your own last move.')
      }
      const used = room.takebacksUsed?.[color] ?? 0
      if (used >= MAX_TAKEBACKS) throw new HttpsError('failed-precondition', 'No takebacks left this game.')

      // Verify the requester can afford the next one up-front, so the
      // opponent never accepts a takeback that then fails to charge.
      const name = normalizeName((color === 'w' ? room.white : room.black!).displayName)
      const gsnap = await tx.get(db.doc(`guests/${name}`))
      const cost = TAKEBACK_COSTS[used]!
      if (!gsnap.exists || (gsnap.data() as GuestDoc).castlePoints < cost) {
        throw new HttpsError('failed-precondition', `Not enough castle points (need ${cost}).`)
      }

      tx.update(ref, { takeback: { by: color, atMoveCount: moves.length }, updatedAt: Date.now() })
      return { ok: true }
    })
  },
)

export const respondTakeback = onCall<
  { roomId: string; accept: boolean },
  Promise<{ ok: boolean; accepted: boolean }>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const roomId = (req.data?.roomId ?? '').trim()
  const accept = req.data?.accept === true
  if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
  const db = getFirestore()
  const ref = db.doc(`rooms/${roomId}`)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Room not found.')
    const room = snap.data() as RoomDoc
    const offer = room.takeback
    if (!offer) throw new HttpsError('failed-precondition', 'No takeback to answer.')
    const color = callerColor(room, uid)
    if (!color || color === offer.by) {
      throw new HttpsError('permission-denied', 'Only your opponent can answer.')
    }
    const moves = room.moves ?? []
    // Stale offer (a move arrived since) — drop it without charging.
    if (offer.atMoveCount !== moves.length || room.status !== 'live') {
      tx.update(ref, { takeback: null, updatedAt: Date.now() })
      return { ok: true, accepted: false }
    }

    const now = Date.now()
    if (!accept) {
      tx.update(ref, { takeback: null, updatedAt: now })
      return { ok: true, accepted: false }
    }

    // Accept: remove ONLY the requester's last move.
    const removed = moves[moves.length - 1]!
    const newMoves = moves.slice(0, -1)
    // Recompute the position from the truncated list (authoritative).
    const chess = new Chess()
    for (const m of newMoves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
    }
    const fen = newMoves.length > 0 ? chess.fen() : removed.fenBefore

    // Charge the requester (read inside the same transaction).
    const reqName = normalizeName((offer.by === 'w' ? room.white : room.black!).displayName)
    const greq = db.doc(`guests/${reqName}`)
    const gsnap = await tx.get(greq)
    const used = room.takebacksUsed?.[offer.by] ?? 0
    const cost = TAKEBACK_COSTS[used]!
    if (gsnap.exists) {
      const guest = gsnap.data() as GuestDoc
      if (guest.castlePoints >= cost) {
        const after = guest.castlePoints - cost
        tx.update(greq, { castlePoints: after })
        appendAuditTx(tx, {
          normalizedName: reqName,
          uid: guest.uids[0] ?? uid,
          delta: -cost,
          before: guest.castlePoints,
          after,
          source: `takeback-online:${used + 1}`,
          metadata: { roomId, index: used + 1, cost },
        })
      }
    }

    const usedMap = { w: room.takebacksUsed?.w ?? 0, b: room.takebacksUsed?.b ?? 0 }
    usedMap[offer.by] = used + 1
    tx.update(ref, {
      moves: newMoves,
      currentFen: fen,
      takeback: null,
      takebacksUsed: usedMap,
      // Hand the clock to the side that just got their move back.
      lastTickServerTs: room.timeControl ? now : null,
      updatedAt: now,
    })
    return { ok: true, accepted: true }
  })
})
