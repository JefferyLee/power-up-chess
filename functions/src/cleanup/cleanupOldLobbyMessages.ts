// Scheduled hourly cleanup — drop Hall chat messages older than 24 h
// and any story_quiz_keys / story_quiz_attempts that were attached to
// them. The lobby chat is a live shared space, not history; old
// messages just clutter the scroll and the Firestore bill.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const TTL_MS = 24 * 60 * 60 * 1000
const MAX_DELETE_PER_RUN = 1000

export const cleanupOldLobbyMessages = onSchedule(
  { schedule: 'every 1 hours', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore()
    const cutoff = Date.now() - TTL_MS
    const snap = await db
      .collection('lobby/messages/items')
      .where('ts', '<', cutoff)
      .limit(MAX_DELETE_PER_RUN)
      .get()
    if (snap.empty) {
      console.log('cleanupOldLobbyMessages: nothing to delete')
      return
    }

    // Each message may have a sibling story_quiz_keys/{messageId} secret
    // and a story_quiz_attempts/{messageId} subcollection. recursiveDelete
    // handles the subcollection in one shot.
    let messageCount = 0
    let quizKeyCount = 0
    for (const doc of snap.docs) {
      await doc.ref.delete()
      messageCount++
      const keyRef = db.doc(`story_quiz_keys/${doc.id}`)
      const keySnap = await keyRef.get()
      if (keySnap.exists) {
        await keyRef.delete()
        quizKeyCount++
      }
      const attemptsRef = db.doc(`story_quiz_attempts/${doc.id}`)
      await db.recursiveDelete(attemptsRef)
    }
    console.log(
      `cleanupOldLobbyMessages: deleted ${messageCount} messages, ${quizKeyCount} quiz keys`,
    )
  },
)
