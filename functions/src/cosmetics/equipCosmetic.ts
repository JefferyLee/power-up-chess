// equipCosmetic — switch the equipped piece-set without spending
// points. Free sets are always available; purchased sets are gated on
// presence in cosmetics.ownedPieceSets.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
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
  const guestRef = db.doc(`guests/${normalizedName}`)

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(guestRef)
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Guest record not found.')
    }
    const guest = snap.data() as GuestDoc
    if (!guest.uids.includes(uid)) {
      throw new HttpsError(
        'permission-denied',
        'You can only equip for yourself.',
      )
    }
    if (guest.activeSessionId && guest.activeSessionId !== sessionId) {
      throw new HttpsError(
        'failed-precondition',
        'Your session is no longer active. Please refresh.',
      )
    }

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
