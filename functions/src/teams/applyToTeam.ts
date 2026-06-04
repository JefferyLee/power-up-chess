// applyToTeam — kid taps "Apply to join" on a recruit card or the
// Team page. Creates a `team_applications/{applicationId}` doc that
// the captain sees in their Team Inbox.
//
// Dedupe: applicationId = `${callerUid}_${teamId}` — re-applying
// while a pending app exists just overwrites it (refreshes the
// expiresAt). Free for the applicant — only creating a team costs CP.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  TEAM_APPLICATION_TTL_DAYS,
  TEAM_MEMBER_MAX,
  TEAM_PER_USER_MAX,
  type GuestDoc,
  type TeamApplicationDoc,
  type TeamDoc,
} from '../castle/types'

const DAY_MS = 24 * 60 * 60 * 1000
const PITCH_MAX = 120

export interface ApplyToTeamRequest {
  teamId: string
  pitch?: string
}
export interface ApplyToTeamResponse {
  applicationId: string
  expiresAt: number
}

export const applyToTeam = onCall<ApplyToTeamRequest, Promise<ApplyToTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    if (!teamId) throw new HttpsError('invalid-argument', 'teamId required.')
    const pitch = String(req.data?.pitch ?? '').trim().slice(0, PITCH_MAX) || undefined

    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Sign in with a magic word to apply.')
    }

    const teamRef = db.doc(`teams/${teamId}`)
    const guestRef = db.doc(`guests/${idData.normalizedName}`)
    const applicationId = `${uid}_${teamId}`
    const appRef = db.doc(`team_applications/${applicationId}`)

    const now = Date.now()
    const expiresAt = now + TEAM_APPLICATION_TTL_DAYS * DAY_MS

    return db.runTransaction(async (tx) => {
      const [teamSnap, guestSnap] = await Promise.all([tx.get(teamRef), tx.get(guestRef)])
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      if (!guestSnap.exists) throw new HttpsError('not-found', 'Guest record missing.')
      const team = teamSnap.data() as TeamDoc
      const guest = guestSnap.data() as GuestDoc

      if (team.memberCount >= TEAM_MEMBER_MAX) {
        throw new HttpsError('failed-precondition', 'Team is already full.')
      }
      if (team.members.some((m) => m.normalizedName === idData.normalizedName)) {
        throw new HttpsError('failed-precondition', "You're already on this team.")
      }
      const existingTeams = Array.isArray(guest.teamIds) ? guest.teamIds : []
      if (existingTeams.length >= TEAM_PER_USER_MAX) {
        throw new HttpsError(
          'failed-precondition',
          `You're already in ${existingTeams.length} teams. Leave one before applying to another.`,
        )
      }

      const application: TeamApplicationDoc = {
        applicationId,
        teamId,
        fromUid: uid,
        fromNormalizedName: idData.normalizedName,
        fromDisplayName: idData.displayName,
        ...(pitch ? { pitch } : {}),
        createdAt: now,
        expiresAt,
        status: 'pending',
      }
      tx.set(appRef, application)
      return { applicationId, expiresAt }
    })
  },
)
