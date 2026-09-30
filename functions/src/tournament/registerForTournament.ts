// registerForTournament — adds the caller to the current week's
// tournament if they pass the entry gate.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from '../castle/requireOwner'
import { postTournamentRegistration } from '../castle/postTournamentRegistration'
import {
  TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES,
  TOURNAMENT_ENTRY_WEEKLY_SOLVES,
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

  const result = await db.runTransaction<RegisterForTournamentResponse>(async (tx) => {
    const [tSnap, { guest }] = await Promise.all([
      tx.get(tournamentRef),
      requireOwnedGuest(db, uid, normalizedName, tx, { sessionId }),
    ])

    // Spec gate: 50 puzzles solved THIS week. Beta fallback: lifetime
    // solves >= 5 (so kids who already had momentum before weekly
    // tracking went live can still enter). Either passing is fine.
    const weekKeyNow = tournamentWeekKey()
    const weeklyCount =
      guest.puzzleSolvesThisWeek?.weekKey === weekKeyNow
        ? guest.puzzleSolvesThisWeek.count
        : 0
    const lifetimeSolved = guest.puzzleStats?.solved ?? 0
    const weeklyOk = weeklyCount >= TOURNAMENT_ENTRY_WEEKLY_SOLVES
    const lifetimeOk = lifetimeSolved >= TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES
    if (!weeklyOk && !lifetimeOk) {
      throw new HttpsError(
        'failed-precondition',
        `Need ${TOURNAMENT_ENTRY_WEEKLY_SOLVES} puzzles solved this week ` +
          `(or ${TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES} lifetime during beta) — ` +
          `you have ${weeklyCount} this week, ${lifetimeSolved} lifetime.`,
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

  // Fire-and-forget Hall hype post on first-time registrations only.
  // Re-registers (race conditions, re-clicks) stay silent so chat
  // doesn't spam.
  if (!result.alreadyRegistered) {
    const newcomer =
      result.tournament.participants[result.tournament.participants.length - 1]
    if (newcomer) {
      void postTournamentRegistration({
        displayName: newcomer.displayName,
        participantCount: result.tournament.participants.length,
        weekKey,
      })
    }
  }

  return result
})
