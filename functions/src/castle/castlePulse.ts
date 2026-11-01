// castlePulse — a public, counts-only view of castle_live/pulse for the
// Corner of Babel (cornerofbabel.com). The library lights the slit window
// beside the castle's door when someone is inside. No names, no story
// text; CORS is limited to the library's two origins. Cached a minute,
// which is well under the pulse's own 2-minute rebuild.

import { getFirestore } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import type { CastleLivePulse } from './refreshCastleLivePulse'

export const PULSE_ORIGINS = [
  'https://cornerofbabel.com',
  'https://staging.cornerofbabel.com',
]

export interface PublicPulse {
  inCastleNow: number
  duelsInProgress: number
  visitorsToday: number
  refreshedAt: number
}

export function publicPulse(data: Partial<CastleLivePulse> | undefined): PublicPulse {
  return {
    inCastleNow: count(data?.inCastleNow),
    duelsInProgress: count(data?.duelsInProgress),
    visitorsToday: count(data?.visitorsToday),
    refreshedAt: count(data?.refreshedAt),
  }
}

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

export const castlePulse = onRequest({ cors: PULSE_ORIGINS }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).set('Allow', 'GET').end()
    return
  }
  const snap = await getFirestore().doc('castle_live/pulse').get()
  res.set('Cache-Control', 'public, max-age=60')
  res.json(publicPulse(snap.data() as Partial<CastleLivePulse> | undefined))
})
