// findPlayer — search the guest directory by normalizedName prefix.
//
// Privacy: gate already exposes the top-5 names publicly; chat shows
// names freely. Search adds no new disclosure beyond "can someone
// confirm/look up a name they already know". Capped result list +
// min-length input + auth-required to keep it from becoming a
// scraping endpoint.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from './types'

const MIN_QUERY = 2
const MAX_QUERY = 20
const MAX_RESULTS = 8

interface Request {
  query: string
}
interface Match {
  normalizedName: string
  displayName: string
}
interface Response {
  matches: Match[]
}

export const findPlayer = onCall<Request, Promise<Response>>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const raw = String(req.data?.query ?? '').trim().toLowerCase()
  if (raw.length < MIN_QUERY || raw.length > MAX_QUERY) {
    return { matches: [] }
  }

  const db = getFirestore()
  // Firestore-native prefix search via [start, start+). Works
  // because doc ids ARE normalizedName, and orderBy(__name__) is free.
  const upper = raw + ''
  const snap = await db
    .collection('guests')
    .orderBy('normalizedName')
    .startAt(raw)
    .endAt(upper)
    .limit(MAX_RESULTS)
    .get()

  const matches: Match[] = snap.docs
    .filter((d) => !(d.data() as GuestDoc).hideFromLeaderboards) // Phase 3.7
    .map((d) => {
    const g = d.data() as GuestDoc
    return {
      normalizedName: g.normalizedName,
      displayName: g.displayName,
    }
  })
  return { matches }
})
