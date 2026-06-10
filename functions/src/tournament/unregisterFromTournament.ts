// unregisterFromTournament — drops the caller from the current week's
// participant list. Only valid while the tournament is still in
// 'registration' status; once round 1 has been paired (status =
// 'active'), pulling a participant out would orphan their pairing
// references, so we block it. The route surfaces an explicit error
// in that case.
//
// No chat post on cancel — the original "X just signed up" herald
// note stays in the log; spamming an undo announcement clutters the
// Hall.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

export interface UnregisterFromTournamentRequest {
  normalizedName: string
  sessionId: string
}

export interface UnregisterFromTournamentResponse {
  ok: true
  tournament: TournamentDoc
  /** True iff the caller wasn't on the list to begin with. Idempotent. */
  wasNotRegistered: boolean
}

export const unregisterFromTournament = onCall<
  UnregisterFromTournamentRequest,
  Promise<UnregisterFromTournamentResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  if (!normalizedName) {
    throw new HttpsError('invalid-argument', 'normalizedName required.')
  }

  const db = getFirestore()
  const tournamentRef = db.doc(`tournaments/${tournamentWeekKey()}`)
  const guestRef = db.doc(`guests/${normalizedName}`)

  return db.runTransaction<UnregisterFromTournamentResponse>(async (tx) => {
    const [tSnap, gSnap] = await Promise.all([
      tx.get(tournamentRef),
      tx.get(guestRef),
    ])
    if (!gSnap.exists) {
      throw new HttpsError('permission-denied', 'Guest record not found.')
    }
    const guest = gSnap.data() as GuestDoc
    if (!guest.uids.includes(uid)) {
      throw new HttpsError(
        'permission-denied',
        'You can only unregister yourself.',
      )
    }
    if (guest.activeSessionId && guest.activeSessionId !== sessionId) {
      throw new HttpsError(
        'failed-precondition',
        'Your session is no longer active. Please refresh.',
      )
    }
    if (!tSnap.exists) {
      throw new HttpsError('not-found', 'No tournament this week.')
    }
    const tournament = tSnap.data() as TournamentDoc
    if (tournament.status !== 'registration') {
      throw new HttpsError(
        'failed-precondition',
        'Round 1 has already started — you can\'t pull out now.',
      )
    }
    const before = tournament.participants
    const after = before.filter((p) => p.normalizedName !== normalizedName)
    if (after.length === before.length) {
      return { ok: true, tournament, wasNotRegistered: true }
    }
    tx.update(tournamentRef, { participants: after })
    return {
      ok: true,
      tournament: { ...tournament, participants: after },
      wasNotRegistered: false,
    }
  })
})
