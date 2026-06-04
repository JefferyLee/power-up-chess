// getRecentlyPlayed — returns the caller's recentlyPlayedWith list,
// enriched with current online-state + cosmetic flags so the Hall
// sidebar can render presence chips next to each name without a
// second round-trip.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from './types'
import type { PresenceDoc } from './chatTypes'

const PRESENCE_FRESH_MS = 45_000

interface Entry {
  normalizedName: string
  displayName: string
  /** ms since last interaction with this guest. */
  lastPlayedAt: number
  /** Currently online somewhere in the castle? */
  online: boolean
  /** Lightweight presence summary — null when offline. */
  here?: 'hall' | 'chess' | 'wizard' | 'puzzle' | 'practice' | 'local' | 'forest'
}

interface Response {
  entries: Entry[]
}

function bucketLocation(kind: string | undefined): Entry['here'] | undefined {
  if (!kind) return 'hall'
  if (kind === 'hall') return 'hall'
  if (kind === 'chess') return 'chess'
  if (kind === 'wizard') return 'wizard'
  if (kind.startsWith('puzzle')) return 'puzzle'
  if (kind === 'practice') return 'practice'
  if (kind === 'local') return 'local'
  if (kind === 'forest') return 'forest'
  return undefined
}

export const getRecentlyPlayed = onCall<unknown, Promise<Response>>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const db = getFirestore()

  // Resolve caller via the chat_identity shadow doc (the same one
  // postChat / hostStoryAnswer use). Bypass guests have no list.
  const idSnap = await db.doc(`chat_identity/${uid}`).get()
  const idData = idSnap.data() as
    | { normalizedName: string; isBypass: boolean }
    | undefined
  if (!idData || idData.isBypass || !idData.normalizedName) {
    return { entries: [] }
  }

  const guestSnap = await db.doc(`guests/${idData.normalizedName}`).get()
  if (!guestSnap.exists) return { entries: [] }
  const guest = guestSnap.data() as GuestDoc
  if (!guest.uids.includes(uid)) return { entries: [] }
  const raw = Array.isArray(guest.recentlyPlayedWith) ? guest.recentlyPlayedWith : []
  if (raw.length === 0) return { entries: [] }

  // Bulk presence lookup — one read per recent partner, in parallel.
  // The collection isn't keyed by normalizedName so we have to query.
  // Cap of 12 entries means at most 12 small queries.
  const now = Date.now()
  const presenceLookups = await Promise.all(
    raw.map(async (e) => {
      const q = await db
        .collection('lobby/presence/items')
        .where('normalizedName', '==', e.normalizedName)
        .get()
      let freshest: PresenceDoc | null = null
      for (const d of q.docs) {
        const p = d.data() as PresenceDoc
        if (now - p.lastSeenAt > PRESENCE_FRESH_MS) continue
        if (!freshest || p.lastSeenAt > freshest.lastSeenAt) freshest = p
      }
      return freshest
    }),
  )

  const entries: Entry[] = raw.map((e, i) => {
    const p = presenceLookups[i]
    const here = p ? bucketLocation(p.location?.kind) : undefined
    return {
      normalizedName: e.normalizedName,
      displayName: e.displayName,
      lastPlayedAt: typeof e.at === 'number' ? e.at : 0,
      online: !!p,
      ...(here ? { here } : {}),
    }
  })

  return { entries }
})
