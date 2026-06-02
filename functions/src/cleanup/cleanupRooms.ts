// Scheduled daily cleanup — drops chess + wizard rooms whose last
// update is more than 24h ago. Uses Firestore's recursiveDelete so
// subcollections (wizard messages, rate_limits) go with the parent.
//
// 24h is a generous threshold: anyone playing correspondence chess will
// move within a day; anyone who didn't was abandoning the room.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const STALE_AFTER_MS = 24 * 60 * 60 * 1000
const COLLECTIONS = ['rooms', 'wizard_rooms'] as const
const MAX_DELETE_PER_RUN = 500 // safety cap so a single run can't blow up

export const cleanupStaleRooms = onSchedule(
  { schedule: 'every day 03:00', timeZone: 'America/Los_Angeles', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore()
    const cutoff = Date.now() - STALE_AFTER_MS

    let totalDeleted = 0
    for (const colName of COLLECTIONS) {
      const stale = await db
        .collection(colName)
        .where('updatedAt', '<', cutoff)
        .limit(MAX_DELETE_PER_RUN)
        .get()
      for (const doc of stale.docs) {
        // recursiveDelete handles subcollections (wizard_rooms/{id}/messages,
        // wizard_rooms/{id}/rate_limits, etc.) in one shot.
        await db.recursiveDelete(doc.ref)
        totalDeleted++
      }
      console.log(`cleanupStaleRooms[${colName}]: deleted ${stale.size}`)
    }
    console.log(`cleanupStaleRooms: total deleted = ${totalDeleted}`)
  },
)
