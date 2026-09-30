// startNextRound — any registered participant can trigger pairing
// for the next round. Transitions the tournament from
// 'registration' to 'active' on first call. Refuses when
// every Swiss matchup has already been played.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import { isPairingExhausted, pairNextRound } from './pairing'
import {
  TOURNAMENT_MAX_ROUNDS,
  type TournamentDoc,
  type TournamentRound,
} from './types'
import { tournamentWeekKey } from './weekKey'

export interface StartNextRoundRequest {
  normalizedName: string
  sessionId: string
}

export interface StartNextRoundResponse {
  ok: true
  tournament: TournamentDoc
}

export const startNextRound = onCall<
  StartNextRoundRequest,
  Promise<StartNextRoundResponse>
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

  return db.runTransaction(async (tx) => {
    const [tSnap] = await Promise.all([
      tx.get(tournamentRef),
      requireOwnedGuest(db, uid, normalizedName, tx, { sessionId }),
    ])
    if (!tSnap.exists) {
      throw new HttpsError('not-found', 'No tournament this week.')
    }
    const tournament = tSnap.data() as TournamentDoc
    if (tournament.status === 'closed') {
      throw new HttpsError('failed-precondition', 'Tournament is closed.')
    }
    // Only registered participants can trigger pairings — keeps a
    // random visitor from blowing up the event.
    if (!tournament.participants.some((p) => p.normalizedName === normalizedName)) {
      throw new HttpsError(
        'permission-denied',
        'Only registered participants can start the next round.',
      )
    }
    if (tournament.participants.length < 2) {
      throw new HttpsError(
        'failed-precondition',
        'At least 2 participants are needed to pair a round.',
      )
    }
    // Every pairing in the previous round must have a result before
    // we generate the next one.
    const rounds = tournament.rounds ?? []
    const lastRound = rounds[rounds.length - 1]
    if (lastRound) {
      const allDone = lastRound.pairings.every((p) => p.result !== undefined)
      if (!allDone) {
        throw new HttpsError(
          'failed-precondition',
          'Finish reporting the current round before starting the next one.',
        )
      }
    }
    if (rounds.length >= TOURNAMENT_MAX_ROUNDS) {
      throw new HttpsError(
        'failed-precondition',
        `Round cap reached (${TOURNAMENT_MAX_ROUNDS}). Close the tournament.`,
      )
    }
    if (isPairingExhausted(tournament.participants, rounds)) {
      throw new HttpsError(
        'failed-precondition',
        'Every pairing has been played — close the tournament.',
      )
    }

    const pairings = pairNextRound(tournament.participants, rounds)
    if (pairings.length === 0) {
      throw new HttpsError('internal', 'Pairing algorithm returned no pairings.')
    }
    const newRound: TournamentRound = {
      index: rounds.length,
      startedAt: Date.now(),
      pairings,
    }
    const nextStatus =
      tournament.status === 'registration' ? 'active' : tournament.status
    const updated: TournamentDoc = {
      ...tournament,
      status: nextStatus,
      rounds: [...rounds, newRound],
    }
    tx.update(tournamentRef, {
      status: nextStatus,
      rounds: updated.rounds,
    })
    return { ok: true, tournament: updated }
  })
})
