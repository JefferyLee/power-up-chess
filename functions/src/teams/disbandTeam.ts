// disbandTeam — captain-only. Tear the team down completely.
//
// Removes the team doc, releases the name lock, and strips the teamId
// from every member's guest doc. Members keep all their other state
// (castle points, plaque stats, etc) — only the team affiliation
// disappears. No refund of the 100 CP creation cost.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { TeamDoc } from '../castle/types'
import { disbandTeamTx } from './disbandHelpers'

export interface DisbandTeamRequest {
  teamId: string
}
export interface DisbandTeamResponse {
  ok: true
}

export const disbandTeam = onCall<DisbandTeamRequest, Promise<DisbandTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    if (!teamId) throw new HttpsError('invalid-argument', 'teamId required.')

    const db = getFirestore()
    const teamRef = db.doc(`teams/${teamId}`)

    await db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef)
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can disband.')
      }
      await disbandTeamTx(tx, team, db)
    })
    return { ok: true as const }
  },
)
