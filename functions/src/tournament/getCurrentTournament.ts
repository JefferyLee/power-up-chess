// getCurrentTournament — reads (or lazily creates) the current
// week's tournament doc and returns it. Lazy creation means we
// don't need a cron — the first kid to open /tournament in a new
// week brings the doc into existence.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  TOURNAMENT_WEEK_MS,
  type TournamentDoc,
} from './types'
import { tournamentWeekKey } from './weekKey'

export interface GetCurrentTournamentResponse {
  ok: true
  tournament: TournamentDoc
}

export const getCurrentTournament = onCall<
  Record<string, never>,
  Promise<GetCurrentTournamentResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const db = getFirestore()
  const weekKey = tournamentWeekKey()
  const ref = db.doc(`tournaments/${weekKey}`)
  const snap = await ref.get()
  if (snap.exists) {
    // Normalize defensively — Slice 1 docs were created before
    // `rounds` existed on the type, so old docs may be missing it.
    const raw = snap.data() as Partial<TournamentDoc>
    return {
      ok: true,
      tournament: {
        weekKey,
        status: raw.status ?? 'registration',
        openedAt: raw.openedAt ?? Date.now(),
        closesAt: raw.closesAt ?? Date.now() + TOURNAMENT_WEEK_MS,
        participants: raw.participants ?? [],
        rounds: raw.rounds ?? [],
        ...(raw.winnerName !== undefined ? { winnerName: raw.winnerName } : {}),
        ...(raw.closedAt !== undefined ? { closedAt: raw.closedAt } : {}),
      },
    }
  }
  // Race-safe create: a concurrent caller might also be here. Use
  // create() so only one wins; the loser falls through to read the
  // doc the winner just wrote.
  const now = Date.now()
  const fresh: TournamentDoc = {
    weekKey,
    status: 'registration',
    openedAt: now,
    closesAt: now + TOURNAMENT_WEEK_MS,
    participants: [],
    rounds: [],
  }
  try {
    await ref.create(fresh)
    return { ok: true, tournament: fresh }
  } catch {
    const reread = await ref.get()
    if (reread.exists) {
      return { ok: true, tournament: reread.data() as TournamentDoc }
    }
    throw new HttpsError('internal', 'Could not open this week\'s tournament.')
  }
})
