// awardCastlePoints — server-authoritative point award for the sources a
// client may still claim: puzzle solves, post-game reviews and the
// mystery riddle. The caller's uid must appear in the target guest's
// `uids[]` array (set during castleEnter), so you can only award yourself.
//
// Chess wins are NOT claimable here any more (2026-10-12): Local and AI
// wins are settled by syncDeviceGame when the game is recorded, online
// wins by onRoomFinished. A review must name a finished game of the
// caller's (rooms/{id} with the caller in a seat, or the synced
// guests/{name}/games/{id}) — so a review pays once per real game.
//
// Amounts, daily buckets, once-per-event markers and the audit row all
// live in settleAward.ts and are shared with the server-settled paths.
//
// Bypass guests (no guests doc) never reach the award path: the client
// skips the call for them and the ownership check rejects a doc-less name.

import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import type { AwardCastlePointsRequest, AwardCastlePointsResponse } from './types'
import { extractIp } from './ipGeo'
import { requireOwnedGuest } from './requireOwner'
import { amountFor, eventIdFor, settleAwardTx } from './settleAward'

interface SeatLike { displayName?: string }

/** A review is paid for a finished game the caller played: an online
 *  room they sat in, or a Local / AI game they synced. Reads only. */
async function assertOwnFinishedGame(
  tx: Transaction,
  db: Firestore,
  normalizedName: string,
  gameId: string,
): Promise<void> {
  if (/^(local|ai):/.test(gameId)) {
    const snap = await tx.get(db.doc(`guests/${normalizedName}/games/${gameId}`))
    if (snap.exists) return
  } else {
    const snap = await tx.get(db.doc(`rooms/${gameId}`))
    const room = snap.data() as { status?: string; white?: SeatLike; black?: SeatLike } | undefined
    const mine = (seat?: SeatLike) =>
      typeof seat?.displayName === 'string' && seat.displayName.trim().toLowerCase() === normalizedName
    if (room?.status === 'completed' && (mine(room.white) || mine(room.black))) return
  }
  throw new HttpsError('failed-precondition', 'Review rewards need a finished game of yours.')
}

export const awardCastlePoints = onCall<AwardCastlePointsRequest, Promise<AwardCastlePointsResponse>>(APP_CHECK,
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before earning points.')
    }
    const uid = req.auth.uid
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const award = req.data?.award

    if (!normalizedName) {
      throw new HttpsError('invalid-argument', 'normalizedName is required.')
    }
    if (!award || typeof award !== 'object' || !('source' in award)) {
      throw new HttpsError('invalid-argument', 'award is required.')
    }
    // The event id becomes part of a doc id, so it must be a single path segment.
    const eventId = eventIdFor(award)
    if (eventId !== null && (!eventId || eventId.length > 200 || eventId.includes('/'))) {
      throw new HttpsError('invalid-argument', 'gameId is required.')
    }
    if (award.source === 'chess-win') {
      throw new HttpsError('failed-precondition', 'Chess wins are settled by the server when the game is recorded.')
    }

    const db = getFirestore()
    if (amountFor(award) <= 0) {
      // Nothing to pay, but the balance is still only the owner's to read.
      const { guest } = await requireOwnedGuest(db, uid, normalizedName)
      return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
    }

    const ip = extractIp(req)
    return db.runTransaction(async (tx) => {
      const { guest } = await requireOwnedGuest(db, uid, normalizedName, tx)
      if (award.source === 'chess-review') {
        await assertOwnFinishedGame(tx, db, normalizedName, eventId!)
      }
      return settleAwardTx(tx, db, normalizedName, guest, award, { uid, ...(ip ? { ip } : {}) })
    })
  },
)
