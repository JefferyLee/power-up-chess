// sweepTeams — daily scheduled function that disbands stale teams.
//
// Two conditions, evaluated per-team:
//   • Captain inactivity → captain's guest doc lastVisitAt is older
//     than TEAM_CAPTAIN_TIMEOUT_DAYS. The team is leaderless.
//   • Solo lock-in → memberCount === 1 AND lastChangeAt older than
//     TEAM_SOLO_DISBAND_DAYS. A captain who never managed to recruit
//     anyone is occupying a name slot that nobody else can claim.
//
// Disbandment reuses disbandTeamTx so it's the same teardown path
// used by the captain-initiated disband.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  TEAM_CAPTAIN_TIMEOUT_DAYS,
  TEAM_SOLO_DISBAND_DAYS,
  type GuestDoc,
  type TeamDoc,
} from '../castle/types'
import { disbandTeamTx } from './disbandHelpers'

const DAY_MS = 24 * 60 * 60 * 1000

export const sweepTeams = onSchedule(
  { schedule: 'every 24 hours', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const captainCutoff = now - TEAM_CAPTAIN_TIMEOUT_DAYS * DAY_MS
    const soloCutoff = now - TEAM_SOLO_DISBAND_DAYS * DAY_MS

    const teamsSnap = await db.collection('teams').get()
    let disbanded = 0

    for (const teamDocSnap of teamsSnap.docs) {
      const team = teamDocSnap.data() as TeamDoc
      let reason: 'captain-inactive' | 'solo-stale' | null = null

      // Solo-stale check is cheap — no extra read.
      if (team.memberCount <= 1 && team.lastChangeAt < soloCutoff) {
        reason = 'solo-stale'
      } else {
        // Captain inactivity needs a guest doc read. Skip if already
        // flagged by the solo check above.
        const captainGuestSnap = await db.doc(`guests/${team.captainNormalizedName}`).get()
        const captainGuest = captainGuestSnap.exists
          ? (captainGuestSnap.data() as GuestDoc)
          : null
        const lastVisit = captainGuest?.lastVisitAt ?? team.createdAt
        if (lastVisit < captainCutoff) reason = 'captain-inactive'
      }

      if (!reason) continue

      try {
        await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(teamDocSnap.ref)
          if (!freshSnap.exists) return
          const fresh = freshSnap.data() as TeamDoc
          await disbandTeamTx(tx, fresh, db)
        })
        disbanded++
        console.log(`sweepTeams: disbanded ${team.teamId} (${team.name}) — ${reason}`)
      } catch (err) {
        console.warn(`sweepTeams: failed to disband ${team.teamId}`, err)
      }
    }

    if (disbanded > 0) {
      console.log(`sweepTeams: ran on ${teamsSnap.size} teams, disbanded ${disbanded}`)
    }
  },
)
