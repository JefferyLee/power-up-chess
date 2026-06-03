// registerForTournament — adds the caller to the current week's
// tournament if they pass the entry gate.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import {
  TOURNAMENT_ENTRY_MIN_SOLVES,
  TOURNAMENT_WEEK_MS,
  type TournamentDoc,
  type TournamentParticipant,
} from './types'
import { tournamentWeekKey } from './weekKey'

export interface RegisterForTournamentRequest {
  normalizedName: string
  sessionId: string
}

export interface RegisterForTournamentResponse {
  ok: true
  tournament: TournamentDoc
  alreadyRegistered: boolean
}

export const registerForTournament = onCall<
  RegisterForTournamentRequest,
  Promise<RegisterForTournamentResponse>
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
  const weekKey = tournamentWeekKey()
  const tournamentRef = db.doc(`tournaments/${weekKey}`)
  const guestRef = db.doc(`guests/${normalizedName}`)

  return db.runTransaction(async (tx) => {
    const [tSnap, gSnap] = await Promise.all([
      tx.get(tournamentRef),
      tx.get(guestRef),
    ])

    if (!gSnap.exists) {
      throw new HttpsError(
        'permission-denied',
        'Tournament entry needs a real magic-word account.',
      )
    }
    const guest = gSnap.data() as GuestDoc
    if (!guest.uids.includes(uid)) {
      throw new HttpsError(
        'permission-denied',
        'You can only register yourself.',
      )
    }
    if (guest.activeSessionId && guest.activeSessionId !== sessionId) {
      throw new HttpsError(
        'failed-precondition',
        'Your session is no longer active. Please refresh.',
      )
    }
    const solved = guest.puzzleStats?.solved ?? 0
    if (solved < TOURNAMENT_ENTRY_MIN_SOLVES) {
      throw new HttpsError(
        'failed-precondition',
        `Need ${TOURNAMENT_ENTRY_MIN_SOLVES} puzzle solves to enter — you have ${solved}.`,
      )
    }

    // Lazy-create the tournament doc if this is the first activity
    // of the week (mirrors getCurrentTournament).
    const now = Date.now()
    let tournament: TournamentDoc
    if (tSnap.exists) {
      tournament = tSnap.data() as TournamentDoc
    } else {
      tournament = {
        weekKey,
        status: 'registration',
        openedAt: now,
        closesAt: now + TOURNAMENT_WEEK_MS,
        participants: [],
        rounds: [],
      }
    }
    if (tournament.status !== 'registration') {
      throw new HttpsError(
        'failed-precondition',
        'Registration is closed for this week.',
      )
    }

    const already = tournament.participants.some(
      (p) => p.normalizedName === normalizedName,
    )
    if (already) {
      return { ok: true, tournament, alreadyRegistered: true }
    }

    const entry: TournamentParticipant = {
      normalizedName,
      displayName: guest.displayName,
      registeredAt: now,
    }
    const next: TournamentDoc = {
      ...tournament,
      participants: [...tournament.participants, entry],
    }
    if (tSnap.exists) {
      tx.update(tournamentRef, { participants: next.participants })
    } else {
      tx.create(tournamentRef, next)
    }
    return { ok: true, tournament: next, alreadyRegistered: false }
  })
})
