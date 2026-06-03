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
import {
  titleFor,
  WIZARD_ABSOLUTE_FLOOR,
  type CastlePublicStats,
  type GuestDoc,
  type TopGuest,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const TOP_N = 5
/** Below this many active guests, the top-10% percentile isn't
 *  meaningful — fall back to the absolute floor for the wizard gate. */
const MIN_GUESTS_FOR_PCT = 10

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

    const topGuests: TopGuest[] = topSnap.docs.map((d) => {
      const g = d.data() as GuestDoc
      const lifetime = g.lifetimeEarned ?? Math.max(0, g.castlePoints)
      const titleLabel = titleFor(lifetime)?.label
      const halo = g.cosmetics?.duelWinnerExpiresAt
      const crown = g.cosmetics?.winStreakCrownExpiresAt
      const tCrown = g.cosmetics?.tournamentCrownExpiresAt
      return {
        displayName: g.displayName,
        castlePoints: g.castlePoints,
        ...(titleLabel ? { title: titleLabel } : {}),
        ...(typeof halo === 'number' && halo > now ? { hasHalo: true } : {}),
        ...(typeof crown === 'number' && crown > now ? { hasCrown: true } : {}),
        ...(typeof tCrown === 'number' && tCrown > now
          ? { hasTournamentCrown: true }
          : {}),
      }
    })

    // Active-today count — scan + filter. Cheap while the guest list is
    // small; if it grows past a few thousand we can index lastVisitAt.
    const recentSnap = await db
      .collection('guests')
      .where('lastVisitAt', '>=', cutoff)
      .get()
    const activeToday = recentSnap.size

    // Wizard gate threshold — looser of WIZARD_ABSOLUTE_FLOOR (1000) and
    // the rolling top-10% castlePoints across all guests. With few
    // guests we just publish the absolute floor.
    const allGuestsSnap = await db.collection('guests').get()
    const points = allGuestsSnap.docs
      .map((d) => (d.data() as GuestDoc).castlePoints ?? 0)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)
    let top10PctMin = WIZARD_ABSOLUTE_FLOOR
    if (points.length >= MIN_GUESTS_FOR_PCT) {
      const idx = Math.max(0, Math.floor(points.length * 0.1) - 1)
      top10PctMin = points[idx] ?? WIZARD_ABSOLUTE_FLOOR
    }
    const wizardGateMinPoints = Math.max(1, Math.min(WIZARD_ABSOLUTE_FLOOR, top10PctMin))

    const stats: CastlePublicStats = {
      activeToday,
      topGuests,
      refreshedAt: now,
      wizardGateMinPoints,
    }

    await db.doc('castle_public/stats').set(stats)
  },
)
