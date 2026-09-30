// submitEndgameClear — record a cleared endgame position and award
// castle points. Atomic Firestore txn:
//   - dedupes per (lessonId, positionLabel) so the kid can't farm
//   - first clear awards POSITION_REWARD_PTS
//   - first clear that completes every position in the lesson also
//     awards LESSON_MASTER_BONUS_PTS and stamps lessonMasteredAt
//   - increments castlePoints + lifetimeEarned (titles keep climbing)
//
// Bypass guests are silently no-op'd so the client UX still works.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import {
  ENDGAME_LESSONS,
  LESSON_MASTER_BONUS_PTS,
  POSITION_REWARD_PTS,
  isKnownEndgamePosition,
} from './lessonsServer'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'

export interface SubmitEndgameClearRequest {
  normalizedName: string
  sessionId: string
  lessonId: string
  positionLabel: string
}

export interface SubmitEndgameClearResponse {
  ok: true
  pointsAdded: number
  castlePoints: number
  /** Updated cleared-positions list for the lesson. */
  clearedPositions: string[]
  /** True if this clear was the one that mastered the whole lesson. */
  lessonMasteredNow: boolean
}

export const submitEndgameClear = onCall<
  SubmitEndgameClearRequest,
  Promise<SubmitEndgameClearResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const lessonId = String(req.data?.lessonId ?? '').trim()
  const positionLabel = String(req.data?.positionLabel ?? '').trim()

  if (!lessonId || !positionLabel) {
    throw new HttpsError(
      'invalid-argument',
      'lessonId and positionLabel are required.',
    )
  }
  if (!isKnownEndgamePosition(lessonId, positionLabel)) {
    throw new HttpsError('not-found', 'Unknown endgame position.')
  }
  // Bypass guest path — no Firestore record, but return a coherent
  // shape so the client overlay still draws.
  if (!normalizedName) {
    return {
      ok: true,
      pointsAdded: 0,
      castlePoints: 0,
      clearedPositions: [positionLabel],
      lessonMasteredNow: false,
    }
  }

  const db = getFirestore()
  const lessonPositions = ENDGAME_LESSONS[lessonId]!.positions
  const callerIp = extractIp(req)

  return db.runTransaction(async (tx) => {
    const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, normalizedName, tx, { sessionId })

    const progress = guest.endgameProgress?.[lessonId]
    const existing = new Set(progress?.clearedPositions ?? [])
    const wasMastered = !!progress?.lessonMasteredAt

    let pointsAdded = 0
    let lessonMasteredNow = false
    let updatedCleared = Array.from(existing)
    let updateProgress = false

    if (!existing.has(positionLabel)) {
      existing.add(positionLabel)
      updatedCleared = Array.from(existing)
      pointsAdded = POSITION_REWARD_PTS
      updateProgress = true
      const allCleared = lessonPositions.every((p) => existing.has(p))
      if (allCleared && !wasMastered) {
        pointsAdded += LESSON_MASTER_BONUS_PTS
        lessonMasteredNow = true
      }
    }

    const update: Record<string, unknown> = { lastVisitAt: Date.now() }
    if (updateProgress) {
      update[`endgameProgress.${lessonId}.clearedPositions`] = updatedCleared
      if (lessonMasteredNow) {
        update[`endgameProgress.${lessonId}.lessonMasteredAt`] = Date.now()
      }
    }
    if (pointsAdded > 0) {
      update.castlePoints = FieldValue.increment(pointsAdded)
      // Lazy-migrate lifetimeEarned the same way awardCastlePoints does:
      // titles only ever go up.
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
          source: lessonMasteredNow ? 'endgame:lesson-master' : 'endgame:position',
          metadata: { lessonId, positionLabel, lessonMasteredNow },
          ...(callerIp ? { ip: callerIp } : {}),
        })
      }
    }

    return {
      ok: true,
      pointsAdded,
      castlePoints: guest.castlePoints + pointsAdded,
      clearedPositions: updatedCleared,
      lessonMasteredNow,
    }
  })
})
