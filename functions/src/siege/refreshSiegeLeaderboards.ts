// refreshSiegeLeaderboards — scheduled aggregator for the Siege board.
// Every 5 minutes: read every siege_scores doc, drop guests who opted
// out of leaderboards, and publish ONE doc, siege_leaderboards/global,
// with the top 20 per section — display names only. The client reads
// that doc directly (puzzle-leaderboard pattern).

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { SiegeScoreDoc } from './submitSiegeScore'

const TOP_N = 20
const PROJECT_TZ = 'America/Los_Angeles'

export interface SiegeScoreEntry {
  displayName: string
  score: number
  wave: number
}
export interface SiegeStarsEntry {
  displayName: string
  stars: number
}
export interface SiegeLeaderboardDoc {
  topEndless: SiegeScoreEntry[]
  topCampaign: SiegeStarsEntry[]
  daily: { dateKey: string; top: SiegeScoreEntry[] }
  refreshedAt: number
}

export const refreshSiegeLeaderboards = onSchedule(
  { schedule: 'every 5 minutes', timeoutSeconds: 120, region: 'us-central1' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const today = dateKey(now, PROJECT_TZ)

    // Privacy opt-out (Phase 3.7): a single-field equality query, no
    // composite index needed.
    const hiddenSnap = await db.collection('guests').where('hideFromLeaderboards', '==', true).get()
    const hidden = new Set(hiddenSnap.docs.map((d) => d.id))

    const scoresSnap = await db.collection('siege_scores').get()
    const scores = scoresSnap.docs
      .map((d) => d.data() as SiegeScoreDoc)
      .filter((s) => s && typeof s.displayName === 'string' && !hidden.has(s.normalizedName))

    const byName = (a: { displayName: string }, b: { displayName: string }) => a.displayName.localeCompare(b.displayName)

    const topEndless: SiegeScoreEntry[] = scores
      .filter((s) => s.endlessBest)
      .map((s) => ({ displayName: s.displayName, score: s.endlessBest!.score, wave: s.endlessBest!.wave }))
      .sort((a, b) => b.score - a.score || b.wave - a.wave || byName(a, b))
      .slice(0, TOP_N)

    const topCampaign: SiegeStarsEntry[] = scores
      .filter((s) => typeof s.campaignStars === 'number' && s.campaignStars > 0)
      .map((s) => ({ displayName: s.displayName, stars: s.campaignStars! }))
      .sort((a, b) => b.stars - a.stars || byName(a, b))
      .slice(0, TOP_N)

    const dailyTop: SiegeScoreEntry[] = scores
      .filter((s) => s.dailyBest && s.dailyBest.dateKey === today)
      .map((s) => ({ displayName: s.displayName, score: s.dailyBest!.score, wave: s.dailyBest!.wave }))
      .sort((a, b) => b.score - a.score || b.wave - a.wave || byName(a, b))
      .slice(0, TOP_N)

    const doc: SiegeLeaderboardDoc = {
      topEndless,
      topCampaign,
      daily: { dateKey: today, top: dailyTop },
      refreshedAt: now,
    }
    await db.doc('siege_leaderboards/global').set(doc)
  },
)

/** YYYY-MM-DD in the given IANA timezone — the daily challenge's key. */
function dateKey(epochMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}
