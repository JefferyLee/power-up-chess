// submitOpeningClear — record a cleared opening position and award
// castle points. Mirrors submitEndgameClear in shape: atomic txn,
// per-position dedupe, mastery bonus on first full sweep, lifetime
// earnings stay monotonic.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import {
  OPENING_MASTER_BONUS_PTS,
  OPENING_POSITION_COUNT,
  OPENING_POSITION_REWARD_PTS,
  isKnownOpeningPosition,
} from './lessonsServer'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'

export interface SubmitOpeningClearRequest {
  normalizedName: string
  sessionId: string
  openingId: string
  positionIndex: number
}

export interface SubmitOpeningClearResponse {
  ok: true
  pointsAdded: number
  castlePoints: number
  clearedIndexes: number[]
  lessonMasteredNow: boolean
}

export const submitOpeningClear = onCall<
  SubmitOpeningClearRequest,
  Promise<SubmitOpeningClearResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const openingId = String(req.data?.openingId ?? '').trim()
  const positionIndex = Number(req.data?.positionIndex)

  if (!openingId) {
    throw new HttpsError('invalid-argument', 'openingId is required.')
  }
  if (!isKnownOpeningPosition(openingId, positionIndex)) {
    throw new HttpsError('not-found', 'Unknown opening position.')
  }
  if (!normalizedName) {
    // Bypass / unsigned-in: return synthetic shape so the client UI
    // still draws the award strip with 0 points.
    return {
      ok: true,
      pointsAdded: 0,
      castlePoints: 0,
      clearedIndexes: [positionIndex],
      lessonMasteredNow: false,
    }
  }

  const total = OPENING_POSITION_COUNT[openingId]!
  const db = getFirestore()
  const callerIp = extractIp(req)

  return db.runTransaction(async (tx) => {
    const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx, { sessionId })

    const progress = guest.openingProgress?.[openingId]
    const existing = new Set(progress?.clearedIndexes ?? [])
    const wasMastered = !!progress?.lessonMasteredAt

    let pointsAdded = 0
    let lessonMasteredNow = false
    let updatedCleared = Array.from(existing).sort((a, b) => a - b)
    let updateProgress = false

    if (!existing.has(positionIndex)) {
      existing.add(positionIndex)
      updatedCleared = Array.from(existing).sort((a, b) => a - b)
      pointsAdded = OPENING_POSITION_REWARD_PTS
      updateProgress = true
      const allCleared = updatedCleared.length >= total
      if (allCleared && !wasMastered) {
        pointsAdded += OPENING_MASTER_BONUS_PTS
        lessonMasteredNow = true
      }
    }

    const update: Record<string, unknown> = { lastVisitAt: Date.now() }
    if (updateProgress) {
      update[`openingProgress.${openingId}.clearedIndexes`] = updatedCleared
      if (lessonMasteredNow) {
        update[`openingProgress.${openingId}.lessonMasteredAt`] = Date.now()
      }
    }
    if (pointsAdded > 0) {
      update.castlePoints = FieldValue.increment(pointsAdded)
      const lifetimePrev = guest.lifetimeEarned ?? Math.max(0, guest.castlePoints)
      update.lifetimeEarned = lifetimePrev + pointsAdded
    }
    if (Object.keys(update).length > 1) {
      tx.update(guestRef, update)
      if (pointsAdded > 0) {
        appendAuditTx(tx, {
          normalizedName,
          uid,
          delta: pointsAdded,
          before: guest.castlePoints,
          after: guest.castlePoints + pointsAdded,
          source: lessonMasteredNow ? 'opening:lesson-master' : 'opening:position',
          metadata: { openingId, positionIndex, lessonMasteredNow },
          ...(callerIp ? { ip: callerIp } : {}),
        })
      }
    }

    return {
      ok: true,
      pointsAdded,
      castlePoints: guest.castlePoints + pointsAdded,
      clearedIndexes: updatedCleared,
      lessonMasteredNow,
    }
  })
})
