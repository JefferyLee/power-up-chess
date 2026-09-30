// listGuests — the full castle directory, most-recently-seen first.
//
// Backs the terminal's /users command (which lists everyone registered,
// not just whoever is online right now). Privacy: display names + castle
// points are already public via the gate top-5, chat, leaderboards and
// /find, so this adds no new disclosure beyond "see the whole roster at
// once". Auth-required and hard-capped so it can't be scraped cheaply.
// Guests who opted out of leaderboards (Phase 3.7) are left off, and
// out of the total, so the roster can't undo the opt-out.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from './types'

const LIST_CAP = 500

interface GuestSummary {
  normalizedName: string
  displayName: string
  castlePoints: number
  lastVisitAt: number
}
interface Response {
  guests: GuestSummary[]
  /** True count of registered guests (may exceed guests.length). */
  total: number
}

export const listGuests = onCall<unknown, Promise<Response>>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const db = getFirestore()
  const col = db.collection('guests')

  // True total via aggregate count — cheap, and lets /users say
  // "(showing 500 of N)" honestly when the roster outgrows the cap.
  const [countSnap, hiddenCountSnap, snap] = await Promise.all([
    col.count().get(),
    col.where('hideFromLeaderboards', '==', true).count().get(),
    col.orderBy('lastVisitAt', 'desc').limit(LIST_CAP).get(),
  ])

  const guests: GuestSummary[] = snap.docs
    .filter((d) => !(d.data() as GuestDoc).hideFromLeaderboards)
    .map((d) => {
      const g = d.data() as GuestDoc
      return {
        normalizedName: g.normalizedName,
        displayName: g.displayName,
        castlePoints: g.castlePoints ?? 0,
        lastVisitAt: g.lastVisitAt ?? g.createdAt ?? 0,
      }
    })
  const total = Math.max(0, countSnap.data().count - hiddenCountSnap.data().count)
  return { guests, total }
})
