// disputeTournamentResult — the OPPOSING player on a pairing flags
// the posted result as wrong. The result stays in place for standings
// (so the leaderboard doesn't yo-yo) — the flag surfaces the pairing
// to the admin's override pane. Admin alone clears the dispute via
// overrideTournamentResult.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { BYE_OPPONENT, type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

/** Soft cap on the kid-typed reason. Anything longer gets sliced
 *  (server-side) so chat-message-sized rants can't blow up the doc. */
const MAX_REASON_LEN = 140

export interface DisputeTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  /** Optional free-text — what the kid says actually happened. */
  reason?: string
}

export interface DisputeTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}

export const disputeTournamentResult = onCall<
  DisputeTournamentResultRequest,
  Promise<DisputeTournamentResultResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const sessionId = String(req.data?.sessionId ?? '').trim()
  const roundIndex = Number(req.data?.roundIndex)
  const pairingIndex = Number(req.data?.pairingIndex)
  const reasonRaw = req.data?.reason
  const reason = typeof reasonRaw === 'string'
    ? reasonRaw.trim().slice(0, MAX_REASON_LEN)
    : undefined

  if (
    !normalizedName ||
    !Number.isInteger(roundIndex) ||
    !Number.isInteger(pairingIndex)
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
    if (!round) throw new HttpsError('not-found', 'Round not found.')
    const pairing = round.pairings[pairingIndex]
    if (!pairing) throw new HttpsError('not-found', 'Pairing not found.')
    if (pairing.black === BYE_OPPONENT) {
      throw new HttpsError('failed-precondition', 'Byes can\'t be disputed.')
    }
    if (!pairing.result) {
      throw new HttpsError(
        'failed-precondition',
        'No result has been reported for this pairing yet.',
      )
    }
    if (pairing.overriddenBy) {
      throw new HttpsError(
        'failed-precondition',
        'An admin has already settled this pairing.',
      )
    }
    if (pairing.disputed) {
      throw new HttpsError(
        'failed-precondition',
        'This result is already flagged for review.',
      )
    }
    if (pairing.white !== normalizedName && pairing.black !== normalizedName) {
      throw new HttpsError(
        'permission-denied',
        'Only the two players can dispute a result.',
      )
    }
    if (pairing.reportedBy === normalizedName) {
      throw new HttpsError(
        'failed-precondition',
        'You can\'t dispute your own report. Ask your opponent to flag it.',
      )
    }

    const now = Date.now()
    const updatedRound = {
      ...round,
      pairings: round.pairings.map((p, i) =>
        i === pairingIndex
          ? {
              ...p,
              disputed: {
                byNormalizedName: normalizedName,
                at: now,
                ...(reason ? { reason } : {}),
              },
            }
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
