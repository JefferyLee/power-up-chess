// Scheduled cleanup — drops presence rows that haven't heartbeated in
// >60 s. Cheap; runs every 2 minutes.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const TTL_MS = 60 * 1000

export const cleanupPresence = onSchedule(
  { schedule: 'every 2 minutes', timeoutSeconds: 60 },
  async () => {
    const db = getFirestore()
    const cutoff = Date.now() - TTL_MS
    const snap = await db
      .collection('lobby/presence/items')
      .where('lastSeenAt', '<', cutoff)
      .get()
    if (snap.empty) return
    const batch = db.batch()
    for (const d of snap.docs) batch.delete(d.ref)
    await batch.commit()
    console.log(`cleanupPresence: removed ${snap.size} stale rows`)
  },
)
