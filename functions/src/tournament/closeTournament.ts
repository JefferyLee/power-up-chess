// closeTournament — any registered participant can close the
// tournament once at least one round has all results in. Computes
// the winner by raw score and stamps the doc. The winner crown
// cosmetic + 100 castle-point award land in Slice 3.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { computeScores } from './pairing'
import type { TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

export interface CloseTournamentRequest {
  normalizedName: string
  sessionId: string
}

export interface CloseTournamentResponse {
  ok: true
  tournament: TournamentDoc
  winnerName?: string
}

export const closeTournament = onCall<
  CloseTournamentRequest,
  Promise<CloseTournamentResponse>
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
    if (tournament.status === 'closed') {
      return { ok: true, tournament, winnerName: tournament.winnerName }
    }
    if (!tournament.participants.some((p) => p.normalizedName === normalizedName)) {
      throw new HttpsError(
        'permission-denied',
        'Only registered participants can close the tournament.',
      )
    }
    if (!tournament.rounds || tournament.rounds.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'No rounds played yet — pair a round before closing.',
      )
    }
    // Soft check: at least the latest round must be fully reported.
    const last = tournament.rounds[tournament.rounds.length - 1]!
    const allDone = last.pairings.every((p) => p.result !== undefined)
    if (!allDone) {
      throw new HttpsError(
        'failed-precondition',
        'Finish reporting the current round before closing.',
      )
    }

    const scores = computeScores(tournament.participants, tournament.rounds)
    let topScore = -Infinity
    let winner: { displayName: string; normalizedName: string } | null = null
    // Tiebreak: earliest registration wins (Buchholz comes in slice 3).
    const orderedByReg = [...tournament.participants].sort(
      (a, b) => a.registeredAt - b.registeredAt,
    )
    for (const p of orderedByReg) {
      const s = scores.get(p.normalizedName) ?? 0
      if (s > topScore) {
        topScore = s
        winner = { displayName: p.displayName, normalizedName: p.normalizedName }
      }
    }

    const now = Date.now()
    tx.update(tournamentRef, {
      status: 'closed',
      closedAt: now,
      winnerName: winner?.displayName ?? null,
    })
    return {
      ok: true,
      tournament: {
        ...tournament,
        status: 'closed',
        closedAt: now,
        winnerName: winner?.displayName,
      },
      winnerName: winner?.displayName,
    }
  })
})
