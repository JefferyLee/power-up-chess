// reportTournamentResult — one of the two players reports the
// outcome of their pairing. First report wins. The opposing player
// can flag a wrong result via disputeTournamentResult; an admin
// settles it via overrideTournamentResult.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { BYE_OPPONENT, type PairingResult, type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

export interface ReportTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  /** Bye results are server-determined, not client-reported. */
  result: Exclude<PairingResult, 'bye-white'>
}

export interface ReportTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}

export const reportTournamentResult = onCall<
  ReportTournamentResultRequest,
  Promise<ReportTournamentResultResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const roundIndex = Number(req.data?.roundIndex)
  const pairingIndex = Number(req.data?.pairingIndex)
  const result = req.data?.result
  if (
    !normalizedName ||
    !Number.isInteger(roundIndex) ||
    !Number.isInteger(pairingIndex) ||
    (result !== 'white-wins' && result !== 'black-wins' && result !== 'draw')
  ) {
    throw new HttpsError('invalid-argument', 'Bad payload.')
  }

  const db = getFirestore()
  const tournamentRef = db.doc(`tournaments/${tournamentWeekKey()}`)
  const guestRef = db.doc(`guests/${normalizedName}`)

  return db.runTransaction(async (tx) => {
    const [tSnap, gSnap] = await Promise.all([
      tx.get(tournamentRef),
      tx.get(guestRef),
    ])
    if (!gSnap.exists) {
      throw new HttpsError('permission-denied', 'Guest record not found.')
    }
    const guest = gSnap.data() as GuestDoc
    if (!guest.uids.includes(uid)) {
      throw new HttpsError('permission-denied', 'You can only act as yourself.')
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
    if (tournament.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Tournament is not active.')
    }
    const round = tournament.rounds?.[roundIndex]
    if (!round) {
      throw new HttpsError('not-found', 'Round not found.')
    }
    const pairing = round.pairings[pairingIndex]
    if (!pairing) {
      throw new HttpsError('not-found', 'Pairing not found.')
    }
    if (pairing.result) {
      throw new HttpsError(
        'failed-precondition',
        'A result has already been reported for this pairing.',
      )
    }
    if (pairing.black === BYE_OPPONENT) {
      throw new HttpsError(
        'failed-precondition',
        'Byes are server-set; no need to report.',
      )
    }
    if (pairing.white !== normalizedName && pairing.black !== normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Only the two players can report this result.',
      )
    }

    // Build the updated rounds array (deep enough to swap the one
    // pairing without touching the others).
    const now = Date.now()
    const updatedRound = {
      ...round,
      pairings: round.pairings.map((p, i) =>
        i === pairingIndex
          ? { ...p, result, reportedBy: normalizedName, reportedAt: now }
          : p,
      ),
    }
    const updatedRounds = tournament.rounds.map((r, i) =>
      i === roundIndex ? updatedRound : r,
    )
    tx.update(tournamentRef, { rounds: updatedRounds })
    return {
      ok: true,
      tournament: { ...tournament, rounds: updatedRounds },
    }
  })
})
