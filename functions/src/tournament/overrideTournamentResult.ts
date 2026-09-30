// overrideTournamentResult — admin-only path to settle a disputed
// (or just-wrong) pairing result. Stamps overriddenBy with the
// previous result so the audit trail survives a re-override. Works
// on both active and closed tournaments — closed-tournament fixes
// recompute scores via the standard computeScores() on next render,
// but they do NOT re-award the winner crown (that ship has sailed).

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { isAdmin } from '../castle/requireAdmin'
import { requireOwnedGuest } from '../castle/requireOwner'
import { BYE_OPPONENT, type PairingResult, type TournamentDoc } from './types'
import { tournamentWeekKey } from './weekKey'

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
    !isAdmin(req.auth) ||
    !Number.isInteger(roundIndex) ||
    !Number.isInteger(pairingIndex) ||
    (result !== 'white-wins' && result !== 'black-wins' && result !== 'draw')
  ) {
    throw new HttpsError('permission-denied', 'Admin override only.')
  }

  const db = getFirestore()
  const tournamentRef = db.doc(`tournaments/${tournamentWeekKey()}`)

  return db.runTransaction(async (tx) => {
    // The admin claim decides WHO may override; the owner check still
    // binds the override to the account the admin is signed in as
    // (stamped into overriddenBy below).
    const [tSnap] = await Promise.all([
      tx.get(tournamentRef),
      requireOwnedGuest(db, uid, normalizedName, tx, { sessionId }),
    ])
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
