// refreshCastlePublicStats — scheduled rebuild of castle_public/stats.
//
// Runs every 1 minute (Cloud Scheduler minimum). Aggregates the guests
// collection into:
//   - activeToday: count of guests with lastVisitAt within 24h
//   - topGuests:   top 5 by castlePoints desc
//
// Gate page reads this doc via realtime onSnapshot so updates within the
// minute are visible without polling.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { CastlePublicStats, GuestDoc } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const TOP_N = 5

export const refreshCastlePublicStats = onSchedule(
  { schedule: 'every 1 minutes', timeoutSeconds: 60 },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const cutoff = now - DAY_MS

    // Top 5 by castlePoints
    const topSnap = await db
      .collection('guests')
      .orderBy('castlePoints', 'desc')
      .limit(TOP_N)
      .get()

    const topGuests = topSnap.docs.map((d) => {
      const g = d.data() as GuestDoc
      return { displayName: g.displayName, castlePoints: g.castlePoints }
    })

    // Active-today count — scan + filter. Cheap while the guest list is
    // small; if it grows past a few thousand we can index lastVisitAt.
    const recentSnap = await db
      .collection('guests')
      .where('lastVisitAt', '>=', cutoff)
      .get()
    const activeToday = recentSnap.size

    const stats: CastlePublicStats = {
      activeToday,
      topGuests,
      refreshedAt: now,
    }

    await db.doc('castle_public/stats').set(stats)
  },
)
