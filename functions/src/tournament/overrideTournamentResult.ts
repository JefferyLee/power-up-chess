// overrideTournamentResult — admin-only path to settle a disputed
// (or just-wrong) pairing result. Stamps overriddenBy with the
// previous result so the audit trail survives a re-override. Works
// on both active and closed tournaments — closed-tournament fixes
// recompute scores via the standard computeScores() on next render,
// but they do NOT re-award the winner crown (that ship has sailed).

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { BYE_OPPONENT, type PairingResult, type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

const ADMIN_NORMALIZED_NAME = 'jeff'

export interface OverrideTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  /** Bye results are server-determined; admins can't override into a bye. */
  result: Exclude<PairingResult, 'bye-white'>
}

export interface OverrideTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}

export const overrideTournamentResult = onCall<
  OverrideTournamentResultRequest,
  Promise<OverrideTournamentResultResponse>
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
    normalizedName !== ADMIN_NORMALIZED_NAME ||
    !Number.isInteger(roundIndex) ||
    !Number.isInteger(pairingIndex) ||
    (result !== 'white-wins' && result !== 'black-wins' && result !== 'draw')
  ) {
    throw new HttpsError('permission-denied', 'Admin override only.')
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
    const round = tournament.rounds?.[roundIndex]
    if (!round) throw new HttpsError('not-found', 'Round not found.')
    const pairing = round.pairings[pairingIndex]
    if (!pairing) throw new HttpsError('not-found', 'Pairing not found.')
    if (pairing.black === BYE_OPPONENT) {
      throw new HttpsError('failed-precondition', 'Byes can\'t be overridden.')
    }

    const now = Date.now()
    const updatedRound = {
      ...round,
      pairings: round.pairings.map((p, i) => {
        if (i !== pairingIndex) return p
        // Rebuild the pairing without `disputed` (Firestore rejects
        // `undefined`, so we use destructuring to omit the field).
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { disputed: _, ...rest } = p
        return {
          ...rest,
          result,
          reportedBy: normalizedName,
          reportedAt: now,
          overriddenBy: {
            normalizedName,
            at: now,
            ...(p.result ? { previousResult: p.result } : {}),
          },
        }
      }),
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
