// refreshCastlePublicStats — scheduled rebuild of castle_public/stats.
//
// Runs every 3 minutes. Aggregates the guests collection into:
//   - activeToday:         count of guests with lastVisitAt within 24h
//   - topGuests:           top 5 by castlePoints desc
//   - wizardGateMinPoints: looser of the absolute floor and the rolling
//                          top-10% castlePoints
//
// Gate page reads this doc via realtime onSnapshot. Nothing on it is
// time-critical (the Hall defaults the wizard gate to 1000 until it
// loads), so a 3-minute cadence is fine and costs a third of every-minute.
// No full `guests` scan: counts are aggregation queries and the
// percentile is one rank-offset read.

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
  { schedule: 'every 3 minutes', timeoutSeconds: 60 },
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

    const topGuests: TopGuest[] = topSnap.docs
      // Phase 3.7 — privacy opt-out keeps a guest off the public board.
      .filter((d) => !(d.data() as GuestDoc).hideFromLeaderboards)
      .map((d) => {
      const g = d.data() as GuestDoc
      const lifetime = g.lifetimeEarned ?? Math.max(0, g.castlePoints)
      const titleLabel = titleFor(lifetime)?.label
      const halo = g.cosmetics?.duelWinnerExpiresAt
      const crown = g.cosmetics?.winStreakCrownExpiresAt
      const tCrown = g.cosmetics?.tournamentCrownExpiresAt
      return {
        displayName: g.displayName,
        normalizedName: g.normalizedName,
        castlePoints: g.castlePoints,
        ...(titleLabel ? { title: titleLabel } : {}),
        ...(typeof halo === 'number' && halo > now ? { hasHalo: true } : {}),
        ...(typeof crown === 'number' && crown > now ? { hasCrown: true } : {}),
        ...(typeof tCrown === 'number' && tCrown > now
          ? { hasTournamentCrown: true }
          : {}),
      }
    })

    // Active-today count — aggregation query (billed per 1,000 index
    // entries, not per guest doc).
    const activeToday = (
      await db.collection('guests').where('lastVisitAt', '>=', cutoff).count().get()
    ).data().count

    // Wizard gate threshold — looser of WIZARD_ABSOLUTE_FLOOR (1000) and
    // the rolling top-10% castlePoints across all guests. With few
    // guests we just publish the absolute floor. Rank-based: count the
    // guests, then read the one doc sitting at the 10% rank. Skipped
    // offset docs are billed, so this costs ~10% of a full scan.
    const total = (await db.collection('guests').count().get()).data().count
    let top10PctMin = WIZARD_ABSOLUTE_FLOOR
    if (total >= MIN_GUESTS_FOR_PCT) {
      const idx = Math.max(0, Math.floor(total * 0.1) - 1)
      const atRank = await db
        .collection('guests')
        .orderBy('castlePoints', 'desc')
        .offset(idx)
        .limit(1)
        .get()
      const pts = (atRank.docs[0]?.data() as GuestDoc | undefined)?.castlePoints
      top10PctMin = typeof pts === 'number' && Number.isFinite(pts) ? pts : WIZARD_ABSOLUTE_FLOOR
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
