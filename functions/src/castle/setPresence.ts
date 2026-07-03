// setPresence — called every ~20 s by the Hall while it's mounted.
//
// Also writes a chat_identity/{uid} shadow doc that postChat reads — this
// is what authenticates a chat message's claimed identity. By tying the
// identity decision to presence-heartbeat we avoid every chat needing the
// guest doc lookup on every call.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { LocationTag, SetPresenceRequest, SetPresenceResponse, PresenceDoc } from './chatTypes'
import { titleFor, type GuestDoc } from './types'
import { hostOnDuty } from '../shared/hostOnDuty'
import { laDayKey } from '../puzzles/dailyFive'

interface FullPresenceRequest extends SetPresenceRequest {
  displayName: string
  normalizedName: string
  isBypass: boolean
}

export const setPresence = onCall<FullPresenceRequest, Promise<SetPresenceResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before joining the Hall.')
    const uid = req.auth.uid

    const sessionId = String(req.data?.sessionId ?? '').trim()
    // Client-passed name is only a HINT — for non-bypass guests the server
    // substitutes the guest doc's displayName below (Phase 1.4: no
    // impersonating a registered nickname by editing the client).
    let displayName = String(req.data?.displayName ?? '').trim().slice(0, 40)
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const isBypass = req.data?.isBypass === true

    if (!sessionId || sessionId.length > 40) throw new HttpsError('invalid-argument', 'Bad sessionId.')
    if (!displayName) throw new HttpsError('invalid-argument', 'displayName required.')
    // Bypass guests only ever get server-minted "Guest-N" names
    // (castleBypass) — enforce the shape so a modified client can't pick
    // an arbitrary or impersonating name.
    if (isBypass && !/^Guest-\d{1,8}$/.test(displayName)) {
      throw new HttpsError('invalid-argument', 'Bypass guests use their assigned Guest name.')
    }

    // Server decides the host on duty — same for every visitor at this instant.
    const hostId = hostOnDuty()

    const db = getFirestore()
    let hasHalo = false
    let hasCrown = false
    let hasTournamentCrown = false
    let title: string | null = null
    let todaysFive: Array<boolean | null> | null = null
    let country: string | null = null
    // Verify non-bypass identity against the guest doc + read cosmetic state.
    if (!isBypass) {
      if (!normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required for non-bypass guests.')
      const guestSnap = await db.doc(`guests/${normalizedName}`).get()
      const guest = guestSnap.data() as GuestDoc | undefined
      if (!guest || !guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only set presence as yourself.')
      }
      if (guest.banned) {
        throw new HttpsError('permission-denied', 'This account can’t join the Hall.')
      }
      // Server-authoritative display name (Phase 1.4): whatever the client
      // sent, the Hall shows the name registered on the guest doc.
      displayName = guest.displayName
      // H.7 — single-active-session check. If the client's stamped
      // sessionId no longer matches what castleEnter most recently
      // minted, this device's session has been superseded by another
      // device signing in as the same account. Return early so the
      // client can sign out and inform the user.
      const incomingAuthSession = String(req.data?.authSessionId ?? '')
      if (
        guest.activeSessionId &&         // backfill: guests pre-H.7 lack this
        incomingAuthSession &&           // client started pre-H.7 doesn't send
        guest.activeSessionId !== incomingAuthSession
      ) {
        return { ok: false, evicted: true }
      }
      const now = Date.now()
      const halo = guest.cosmetics?.duelWinnerExpiresAt
      hasHalo = typeof halo === 'number' && halo > now
      const crown = guest.cosmetics?.winStreakCrownExpiresAt
      hasCrown = typeof crown === 'number' && crown > now
      const tCrown = guest.cosmetics?.tournamentCrownExpiresAt
      hasTournamentCrown = typeof tCrown === 'number' && tCrown > now
      const lifetime = guest.lifetimeEarned ?? Math.max(0, guest.castlePoints)
      title = titleFor(lifetime)?.label ?? null
      // Today's Five for the LA day — projected onto the presence doc
      // so the OnlineList can show each guest's mini HP bar without
      // calling getPublicProfile per row. Stale (yesterday's) entries
      // are not surfaced.
      const td = guest.puzzleDaily
      if (td && td.dayKey === laDayKey(Date.now()) && Array.isArray(td.results)) {
        todaysFive = td.results.map((r) =>
          r === true ? true : r === false ? false : null,
        )
      }
      if (typeof guest.recentCountry === 'string' && guest.recentCountry.length === 2) {
        country = guest.recentCountry
      }
    }

    const now = Date.now()
    const location = sanitiseLocation(req.data?.location)
    const presence: PresenceDoc = {
      sessionId,
      displayName,
      normalizedName,
      uid,
      isBypass,
      hostId,
      lastSeenAt: now,
      ...(location ? { location } : {}),
      ...(hasHalo ? { hasHalo: true } : {}),
      ...(hasCrown ? { hasCrown: true } : {}),
      ...(hasTournamentCrown ? { hasTournamentCrown: true } : {}),
      ...(title ? { title } : {}),
      ...(todaysFive ? { todaysFive } : {}),
      ...(country ? { country } : {}),
    }
    await db.doc(`lobby/presence/items/${sessionId}`).set(presence)

    // Shadow identity for postChat to authenticate quickly.
    await db.doc(`chat_identity/${uid}`).set(
      { displayName, normalizedName, isBypass, hostId, updatedAt: now },
      { merge: true },
    )

    return { ok: true }
  },
)

const SOLO_KINDS: ReadonlySet<string> = new Set([
  'hall',
  'puzzle-garden',
  'puzzle-daily',
  'puzzle-legends',
  'puzzle-calibration',
  'puzzle-leaderboard',
  'practice',
  'local',
  'forest',
])

function sanitiseLocation(input: unknown): LocationTag | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as { kind?: unknown; roomId?: unknown; plot?: unknown }
  const kind = String(obj.kind ?? '')
  if (SOLO_KINDS.has(kind)) {
    return { kind } as LocationTag
  }
  if (kind === 'chess' || kind === 'wizard') {
    const roomId = String(obj.roomId ?? '').trim().slice(0, 32)
    if (!roomId) return null
    return { kind, roomId }
  }
  if (kind === 'puzzle-plot') {
    const plot = String(obj.plot ?? '').trim().slice(0, 24)
    if (!plot) return null
    return { kind, plot }
  }
  return null
}
