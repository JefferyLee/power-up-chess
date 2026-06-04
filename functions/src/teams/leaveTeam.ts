// leaveTeam — caller drops themselves from a team's roster.
//
// Edge cases:
//   • Caller is captain → reject (must transferCaptain first OR
//     disbandTeam). UX prompts.
//   • Caller is last member → auto-disband (covers stale teams).

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { disbandTeamTx } from './disbandHelpers'
import type { GuestDoc, TeamDoc } from '../castle/types'

export interface LeaveTeamRequest {
  teamId: string
}
export interface LeaveTeamResponse {
  ok: true
  disbanded: boolean
}

export const leaveTeam = onCall<LeaveTeamRequest, Promise<LeaveTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    if (!teamId) throw new HttpsError('invalid-argument', 'teamId required.')

    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Sign in with a magic word first.')
    }

    const teamRef = db.doc(`teams/${teamId}`)
    const guestRef = db.doc(`guests/${idData.normalizedName}`)

    return db.runTransaction(async (tx) => {
      const [teamSnap, guestSnap] = await Promise.all([tx.get(teamRef), tx.get(guestRef)])
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      if (!guestSnap.exists) throw new HttpsError('not-found', 'Guest record missing.')
      const team = teamSnap.data() as TeamDoc
      const guest = guestSnap.data() as GuestDoc
      if (!guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only leave as yourself.')
      }
      const inTeam = team.members.some((m) => m.normalizedName === idData.normalizedName)
      if (!inTeam) {
        throw new HttpsError('failed-precondition', 'You are not on this team.')
      }
      if (team.captainNormalizedName === idData.normalizedName && team.memberCount > 1) {
        throw new HttpsError(
          'failed-precondition',
          'Captains must transfer the title or disband — not leave directly.',
        )
      }

      // Last person? Auto-disband (the captain in a solo team leaving
      // is functionally the same as disbanding).
      if (team.memberCount <= 1) {
        await disbandTeamTx(tx, team, db)
        tx.update(guestRef, { teamIds: FieldValue.arrayRemove(teamId) })
        return { ok: true as const, disbanded: true }
      }

      // Plain member departure.
      const nextMembers = team.members.filter((m) => m.normalizedName !== idData.normalizedName)
      tx.update(teamRef, {
        members: nextMembers,
        memberCount: nextMembers.length,
        lastChangeAt: Date.now(),
      })
      tx.update(guestRef, { teamIds: FieldValue.arrayRemove(teamId) })
      return { ok: true as const, disbanded: false }
    })
  },
)
