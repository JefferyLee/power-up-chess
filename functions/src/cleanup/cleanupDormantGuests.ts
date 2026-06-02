// Scheduled daily sweep — delete guest accounts that have been idle
// for more than 90 days AND have a zero (or negative-clamped) balance.
//
// Rationale: Phase C decay grinds an idle guest's balance to zero by
// day ~60 at the latest (50 pt → ground by d50, 200 pt → ground by d77).
// We give them another month past that as a buffer in case the human
// is just on a long vacation, then the row is genuinely abandoned.
//
// We do NOT wipe their chat history or guest record proactively before
// day 90 — old chat is already drained by the 24-hour Hall cleanup, and
// presence rows TTL out in 60 s. Just delete the guest doc and let the
// rest of the system catch up.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'

const DAY_MS = 24 * 60 * 60 * 1000
const DORMANT_AFTER_DAYS = 90
const MAX_DELETE_PER_RUN = 200

export const cleanupDormantGuests = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'America/Los_Angeles', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore()
    const cutoff = Date.now() - DORMANT_AFTER_DAYS * DAY_MS

    const snap = await db
      .collection('guests')
      .where('lastVisitAt', '<', cutoff)
      .limit(MAX_DELETE_PER_RUN)
      .get()
    if (snap.empty) {
      console.log('cleanupDormantGuests: nothing dormant')
      return
    }

    let deleted = 0
    let keptForBalance = 0
    for (const doc of snap.docs) {
      const guest = doc.data() as { castlePoints?: number; displayName?: string }
      if ((guest.castlePoints ?? 0) > 0) {
        // Sitting on a balance — give them indefinite grace until decay
        // (or them spending) brings them to zero.
        keptForBalance++
        continue
      }
      await doc.ref.delete()
      deleted++
      console.log(`cleanupDormantGuests: deleted ${doc.id} ("${guest.displayName}")`)
    }
    console.log(
      `cleanupDormantGuests: deleted=${deleted} keptForBalance=${keptForBalance} scanned=${snap.size}`,
    )
  },
)
