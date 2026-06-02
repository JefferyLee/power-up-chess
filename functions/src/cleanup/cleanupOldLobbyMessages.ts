// Scheduled hourly cleanup of Hall chat messages.
//
// Two retention triggers — whichever fires first drops the message:
//   1. Age   ≥ TTL_MS (1 week)
//   2. Count > MAX_KEEP (200 most-recent messages)
//
// The lobby chat is a live shared space, not history; old/excess
// messages clutter the scroll and the Firestore bill.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const TTL_MS = 7 * 24 * 60 * 60 * 1000     // 1 week
const MAX_KEEP = 200                        // keep at most this many most-recent
const MAX_DELETE_PER_RUN = 1000

export const cleanupOldLobbyMessages = onSchedule(
  { schedule: 'every 1 hours', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const cutoff = now - TTL_MS

    // 1. Age sweep — anything older than the TTL goes.
    const ageSnap = await db
      .collection('lobby/messages/items')
      .where('ts', '<', cutoff)
      .limit(MAX_DELETE_PER_RUN)
      .get()
    let ageDeleted = 0
    let keysDeleted = 0
    for (const doc of ageSnap.docs) {
      await deleteWithSiblings(db, doc.ref, doc.id)
      ageDeleted++
      // best-effort sibling count (recursiveDelete on attempts is
      // counted as one operation regardless of subcollection size).
      keysDeleted++ // covers worst case for the log line below
    }

    // 2. Count sweep — if more than MAX_KEEP messages remain, delete
    //    the oldest excess. We cap reads at MAX_KEEP+1 so this stays
    //    cheap even when the chat is busy.
    const countSnap = await db
      .collection('lobby/messages/items')
      .count()
      .get()
    const total = countSnap.data().count
    let countDeleted = 0
    if (total > MAX_KEEP) {
      const excess = Math.min(total - MAX_KEEP, MAX_DELETE_PER_RUN)
      const oldestSnap = await db
        .collection('lobby/messages/items')
        .orderBy('ts', 'asc')
        .limit(excess)
        .get()
      for (const doc of oldestSnap.docs) {
        await deleteWithSiblings(db, doc.ref, doc.id)
        countDeleted++
      }
    }

    console.log(
      `cleanupOldLobbyMessages: age-deleted=${ageDeleted}, count-deleted=${countDeleted}, ` +
      `kept=${Math.max(0, total - countDeleted)} (cap ${MAX_KEEP}), ttl=${TTL_MS}ms`,
    )
    void keysDeleted
  },
)

async function deleteWithSiblings(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference,
  messageId: string,
): Promise<void> {
  await ref.delete()
  // Each message may have a story_quiz_keys/{messageId} secret and a
  // story_quiz_attempts/{messageId} subcollection. recursiveDelete
  // tolerates missing docs.
  const keyRef = db.doc(`story_quiz_keys/${messageId}`)
  const keySnap = await keyRef.get()
  if (keySnap.exists) await keyRef.delete()
  await db.recursiveDelete(db.doc(`story_quiz_attempts/${messageId}`))
}
