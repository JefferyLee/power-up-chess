// createTeam — kid-driven self-organising team creation.
//
// Charges TEAM_CREATE_COST_CP from the caller's castle points, creates
// a teams/{teamId} doc with the caller as captain + sole member, and
// stamps the team id onto the guest doc's teamIds[].
//
// Same-day uniqueness on normalizedName (no two live teams can share
// a name) — prevents the obvious "Lions" / "Lions" confusion.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  TEAM_CREATE_COST_CP,
  TEAM_PER_USER_MAX,
  type GuestDoc,
  type TeamBadge,
  type TeamDoc,
} from '../castle/types'
import { generateTeamId, normalizeTeamName } from './teamId'

const NAME_MIN = 2
const NAME_MAX = 30
const MOTTO_MAX = 60

export interface CreateTeamRequest {
  name: string
  motto?: string
  badge?: TeamBadge
}
export interface CreateTeamResponse {
  teamId: string
  castlePoints: number
}

function sanitiseName(raw: string): string {
  return raw.replace(/[ -]/g, '').trim().slice(0, NAME_MAX)
}

function sanitiseBadge(raw: TeamBadge | undefined): TeamBadge {
  const defaults: TeamBadge = {
    shape: 'shield-heater',
    layout: 'solid',
    bg: '#3a5b9c',
    border: '#1a1530',
    symbol: 'king',
    symbolColor: '#f4c266',
  }
  if (!raw) return defaults
  const allowedShapes = ['shield-heater', 'shield-round', 'shield-pointed', 'roundel']
  const allowedLayouts = ['solid', 'horizontal', 'vertical', 'quartered']
  const colour = (s: unknown): string | undefined =>
    typeof s === 'string' && /^#[0-9a-f]{3,8}$/i.test(s) ? s : undefined
  return {
    shape: allowedShapes.includes(String(raw.shape)) ? raw.shape : defaults.shape,
    layout: allowedLayouts.includes(String(raw.layout)) ? raw.layout : defaults.layout,
    bg: colour(raw.bg) ?? defaults.bg,
    bg2: colour(raw.bg2),
    border: colour(raw.border) ?? defaults.border,
    symbol: typeof raw.symbol === 'string' && raw.symbol.length <= 24 ? raw.symbol : defaults.symbol,
    symbolColor: colour(raw.symbolColor) ?? defaults.symbolColor,
  }
}

export const createTeam = onCall<CreateTeamRequest, Promise<CreateTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid

    const name = sanitiseName(String(req.data?.name ?? ''))
    if (name.length < NAME_MIN) {
      throw new HttpsError('invalid-argument', `Team name needs at least ${NAME_MIN} characters.`)
    }
    const normalizedTeamName = normalizeTeamName(name)
    const motto = String(req.data?.motto ?? '').trim().slice(0, MOTTO_MAX) || undefined
    const badge = sanitiseBadge(req.data?.badge)

    const db = getFirestore()

    // Identity — non-bypass only. Pull through the chat_identity shadow
    // doc that every other callable uses; saves a guest doc round-trip
    // for the cheap "are you signed in as you" check.
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Set presence + sign in with a magic word first.')
    }

    // Uniqueness — case-insensitive. A pending lookup query inside the
    // transaction would be perfect but Firestore doesn't allow queries
    // inside a tx; we use a small `team_names/{normalizedTeamName}`
    // lock doc as a uniqueness primary key.
    const guestRef = db.doc(`guests/${idData.normalizedName}`)
    const nameLockRef = db.doc(`team_names/${encodeURIComponent(normalizedTeamName)}`)

    // Pre-allocate team id outside the tx — extremely unlikely to
    // collide but if it does, throw a retryable error.
    const teamId = generateTeamId()
    const teamRef = db.doc(`teams/${teamId}`)

    const now = Date.now()
    return db.runTransaction(async (tx) => {
      const [guestSnap, lockSnap, teamSnap] = await Promise.all([
        tx.get(guestRef),
        tx.get(nameLockRef),
        tx.get(teamRef),
      ])
      if (!guestSnap.exists) {
        throw new HttpsError('failed-precondition', 'Guest record missing — sign in again.')
      }
      const guest = guestSnap.data() as GuestDoc
      if (!guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only create teams as yourself.')
      }
      if ((guest.castlePoints ?? 0) < TEAM_CREATE_COST_CP) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${TEAM_CREATE_COST_CP} castle points to start a team; you have ${guest.castlePoints ?? 0}.`,
        )
      }
      const existingTeams = Array.isArray(guest.teamIds) ? guest.teamIds : []
      if (existingTeams.length >= TEAM_PER_USER_MAX) {
        throw new HttpsError(
          'failed-precondition',
          `You're already in ${existingTeams.length} teams (max ${TEAM_PER_USER_MAX}). Leave one first.`,
        )
      }
      if (lockSnap.exists) {
        throw new HttpsError(
          'already-exists',
          `Team name "${name}" is already taken. Pick another.`,
        )
      }
      if (teamSnap.exists) {
        throw new HttpsError('aborted', 'Team id collision; please retry.')
      }

      const team: TeamDoc = {
        teamId,
        name,
        normalizedName: normalizedTeamName,
        ...(motto ? { motto } : {}),
        badge,
        captainUid: uid,
        captainNormalizedName: idData.normalizedName,
        captainDisplayName: idData.displayName,
        members: [{
          normalizedName: idData.normalizedName,
          displayName: idData.displayName,
          joinedAt: now,
        }],
        memberCount: 1,
        createdAt: now,
        lastChangeAt: now,
      }
      tx.create(teamRef, team)
      tx.create(nameLockRef, { teamId, normalizedTeamName, createdAt: now })
      tx.update(guestRef, {
        castlePoints: guest.castlePoints - TEAM_CREATE_COST_CP,
        teamIds: FieldValue.arrayUnion(teamId),
      })

      return {
        teamId,
        castlePoints: guest.castlePoints - TEAM_CREATE_COST_CP,
      }
    })
  },
)
