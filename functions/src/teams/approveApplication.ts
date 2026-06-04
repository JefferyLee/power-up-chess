// approveApplication / declineApplication — captain-only inbox
// actions. Approve adds the applicant to the team roster + stamps
// teamId onto their guest doc; decline just flips the status.
//
// Both no-op if the application is no longer pending (expired or
// already resolved). Approval re-validates membership caps in case
// the applicant joined other teams between applying and approval.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  TEAM_MEMBER_MAX,
  TEAM_PER_USER_MAX,
  type GuestDoc,
  type TeamApplicationDoc,
  type TeamDoc,
} from '../castle/types'

export interface ApplicationActionRequest {
  applicationId: string
}
export interface ApplicationActionResponse {
  status: 'approved' | 'declined' | 'noop'
}

export const approveApplication = onCall<ApplicationActionRequest, Promise<ApplicationActionResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const applicationId = String(req.data?.applicationId ?? '').trim()
    if (!applicationId) throw new HttpsError('invalid-argument', 'applicationId required.')

    const db = getFirestore()
    const appRef = db.doc(`team_applications/${applicationId}`)

    return db.runTransaction(async (tx) => {
      const appSnap = await tx.get(appRef)
      if (!appSnap.exists) throw new HttpsError('not-found', 'Application not found.')
      const app = appSnap.data() as TeamApplicationDoc
      if (app.status !== 'pending') {
        return { status: 'noop' as const }
      }
      if (Date.now() > app.expiresAt) {
        tx.update(appRef, { status: 'expired' })
        return { status: 'noop' as const }
      }

      const teamRef = db.doc(`teams/${app.teamId}`)
      const guestRef = db.doc(`guests/${app.fromNormalizedName}`)
      const [teamSnap, guestSnap] = await Promise.all([tx.get(teamRef), tx.get(guestRef)])
      if (!teamSnap.exists) {
        // Team disappeared (disbanded). Treat as a soft no-op.
        tx.update(appRef, { status: 'expired' })
        return { status: 'noop' as const }
      }
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can approve applications.')
      }
      if (team.memberCount >= TEAM_MEMBER_MAX) {
        throw new HttpsError('failed-precondition', 'Team is already full.')
      }
      if (team.members.some((m) => m.normalizedName === app.fromNormalizedName)) {
        tx.update(appRef, { status: 'approved' })
        return { status: 'approved' as const }  // already in — idempotent
      }
      if (!guestSnap.exists) {
        throw new HttpsError('failed-precondition', 'Applicant guest record missing.')
      }
      const guest = guestSnap.data() as GuestDoc
      const existingTeams = Array.isArray(guest.teamIds) ? guest.teamIds : []
      if (existingTeams.length >= TEAM_PER_USER_MAX && !existingTeams.includes(app.teamId)) {
        throw new HttpsError(
          'failed-precondition',
          'Applicant has joined too many teams since applying — they need to leave one first.',
        )
      }

      const now = Date.now()
      const nextMembers = [
        ...team.members,
        {
          normalizedName: app.fromNormalizedName,
          displayName: app.fromDisplayName,
          joinedAt: now,
        },
      ]
      tx.update(teamRef, {
        members: nextMembers,
        memberCount: nextMembers.length,
        lastChangeAt: now,
      })
      tx.update(guestRef, { teamIds: FieldValue.arrayUnion(app.teamId) })
      tx.update(appRef, { status: 'approved' })
      return { status: 'approved' as const }
    })
  },
)

export const declineApplication = onCall<ApplicationActionRequest, Promise<ApplicationActionResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const applicationId = String(req.data?.applicationId ?? '').trim()
    if (!applicationId) throw new HttpsError('invalid-argument', 'applicationId required.')

    const db = getFirestore()
    const appRef = db.doc(`team_applications/${applicationId}`)
    return db.runTransaction(async (tx) => {
      const appSnap = await tx.get(appRef)
      if (!appSnap.exists) throw new HttpsError('not-found', 'Application not found.')
      const app = appSnap.data() as TeamApplicationDoc
      if (app.status !== 'pending') return { status: 'noop' as const }

      const teamSnap = await tx.get(db.doc(`teams/${app.teamId}`))
      if (!teamSnap.exists) {
        tx.update(appRef, { status: 'expired' })
        return { status: 'noop' as const }
      }
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can decline.')
      }
      tx.update(appRef, { status: 'declined' })
      return { status: 'declined' as const }
    })
  },
)

/** Applicant can cancel their own pending application. Same shape so
 *  the client can share one helper. */
export const cancelApplication = onCall<ApplicationActionRequest, Promise<ApplicationActionResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const applicationId = String(req.data?.applicationId ?? '').trim()
    if (!applicationId) throw new HttpsError('invalid-argument', 'applicationId required.')

    const db = getFirestore()
    const appRef = db.doc(`team_applications/${applicationId}`)
    return db.runTransaction(async (tx) => {
      const appSnap = await tx.get(appRef)
      if (!appSnap.exists) throw new HttpsError('not-found', 'Application not found.')
      const app = appSnap.data() as TeamApplicationDoc
      if (app.status !== 'pending') return { status: 'noop' as const }
      if (app.fromUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the applicant can cancel.')
      }
      tx.update(appRef, { status: 'declined' })
      return { status: 'declined' as const }
    })
  },
)
