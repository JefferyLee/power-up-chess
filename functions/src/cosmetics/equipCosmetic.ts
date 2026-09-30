// equipCosmetic — switch the equipped piece-set without spending
// points. Free sets are always available; purchased sets are gated on
// presence in cosmetics.ownedPieceSets.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import { FREE_PIECE_SETS, isKnownPieceSet } from './registry'

export interface EquipCosmeticRequest {
  normalizedName: string
  sessionId: string
  pieceSetId: string
}

export interface EquipCosmeticResponse {
  ok: true
  equippedPieceSet: string
}

export const equipCosmetic = onCall<
  EquipCosmeticRequest,
  Promise<EquipCosmeticResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before equipping.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const pieceSetId = String(req.data?.pieceSetId ?? '').trim()

  if (!normalizedName) {
    throw new HttpsError('invalid-argument', 'normalizedName is required.')
  }
  if (!pieceSetId || !isKnownPieceSet(pieceSetId)) {
    throw new HttpsError('not-found', 'Unknown piece set.')
  }

  const db = getFirestore()

  return db.runTransaction(async (tx) => {
    const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx, { sessionId })

    const isFree = FREE_PIECE_SETS.has(pieceSetId)
    const owned = new Set(guest.cosmetics?.ownedPieceSets ?? [])
    if (!isFree && !owned.has(pieceSetId)) {
      throw new HttpsError(
        'permission-denied',
        'You need to buy that set first.',
      )
    }

    const nextCosmetics = {
      ...(guest.cosmetics ?? {}),
      pieceSet: pieceSetId,
    }
    tx.update(guestRef, {
      cosmetics: nextCosmetics,
      lastVisitAt: Date.now(),
    })

    return { ok: true, equippedPieceSet: pieceSetId }
  })
})
