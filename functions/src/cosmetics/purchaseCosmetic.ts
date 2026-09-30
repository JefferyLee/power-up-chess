// purchaseCosmetic — atomic castle-point debit for a piece-set
// purchase. Adds the id to cosmetics.ownedPieceSets and also equips it
// (kid expects "Buy" to leave the new set already in use).
//
// Free sets (classic, outline) never come through this callable —
// equipCosmetic handles those.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import { isKnownPieceSet, priceFor } from './registry'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'

export interface PurchaseCosmeticRequest {
  normalizedName: string
  /** Client-provided sessionId — must match guest.activeSessionId
   *  (single-active-session policy, see castleEnter). */
  sessionId: string
  /** Piece-set id to purchase. Must be in PURCHASE_REGISTRY. */
  pieceSetId: string
}

export interface PurchaseCosmeticResponse {
  ok: true
  castlePoints: number
  /** Up-to-date owned list after the purchase. */
  ownedPieceSets: string[]
  /** The newly-purchased id is auto-equipped — this is what
   *  cosmetics.pieceSet now holds. */
  equippedPieceSet: string
}

export const purchaseCosmetic = onCall<
  PurchaseCosmeticRequest,
  Promise<PurchaseCosmeticResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before buying.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const pieceSetId = String(req.data?.pieceSetId ?? '').trim()

  if (!normalizedName) {
    throw new HttpsError('invalid-argument', 'normalizedName is required.')
  }
  if (!pieceSetId) {
    throw new HttpsError('invalid-argument', 'pieceSetId is required.')
  }
  if (!isKnownPieceSet(pieceSetId)) {
    throw new HttpsError('not-found', 'Unknown piece set.')
  }
  const price = priceFor(pieceSetId)
  if (price === null) {
    // A free set was sent here by mistake. Tell the client to use equip.
    throw new HttpsError(
      'failed-precondition',
      'That set is free — use equipCosmetic instead.',
    )
  }

  const db = getFirestore()
  const callerIp = extractIp(req)

  return db.runTransaction(async (tx) => {
    const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx, { sessionId })

    const owned = new Set(guest.cosmetics?.ownedPieceSets ?? [])
    if (owned.has(pieceSetId)) {
      throw new HttpsError(
        'already-exists',
        'You already own that set — equip it from the shop.',
      )
    }
    if (guest.castlePoints < price) {
      throw new HttpsError(
        'failed-precondition',
        `Not enough castle points (need ${price}, have ${guest.castlePoints}).`,
      )
    }

    owned.add(pieceSetId)
    const ownedList = Array.from(owned)
    const after = guest.castlePoints - price

    const nextCosmetics = {
      ...(guest.cosmetics ?? {}),
      ownedPieceSets: ownedList,
      pieceSet: pieceSetId,
    }

    tx.update(guestRef, {
      castlePoints: after,
      cosmetics: nextCosmetics,
      lastVisitAt: Date.now(),
    })
    appendAuditTx(tx, {
      normalizedName,
      uid,
      delta: -price,
      before: guest.castlePoints,
      after,
      source: `purchase:${pieceSetId}`,
      metadata: { pieceSetId, price },
      ...(callerIp ? { ip: callerIp } : {}),
    })

    return {
      ok: true,
      castlePoints: after,
      ownedPieceSets: ownedList,
      equippedPieceSet: pieceSetId,
    }
  })
})
