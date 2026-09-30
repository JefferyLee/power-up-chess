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
  type TeamBadge,
  type TeamDoc,
} from '../castle/types'
import type { ChatMessageDoc } from '../castle/chatTypes'
import { hostOnDuty } from '../shared/hostOnDuty'
import { generateTeamId, normalizeTeamName } from './teamId'
import { sanitiseBadge } from './sanitiseBadge'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'
import { requireOwnedGuest } from '../castle/requireOwner'
import { assertCleanTeamText } from './teamText'

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
  // Strip control chars (same class as castleEnter's sanitizeDisplayName).
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX)
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
    // Both land on a public page + in the Hall — same scrub as chat.
    assertCleanTeamText('name', name)
    assertCleanTeamText('motto', motto ?? '')
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
    const nameLockRef = db.doc(`team_names/${encodeURIComponent(normalizedTeamName)}`)

    // Pre-allocate team id outside the tx — extremely unlikely to
    // collide but if it does, throw a retryable error.
    const teamId = generateTeamId()
    const teamRef = db.doc(`teams/${teamId}`)

    const now = Date.now()
    const callerIp = extractIp(req)
    return db.runTransaction(async (tx) => {
      const [{ ref: guestRef, guest }, lockSnap, teamSnap] = await Promise.all([
        requireOwnedGuest(db, uid, idData.normalizedName, tx),
        tx.get(nameLockRef),
        tx.get(teamRef),
      ])
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
      appendAuditTx(tx, {
        normalizedName: idData.normalizedName,
        uid,
        delta: -TEAM_CREATE_COST_CP,
        before: guest.castlePoints,
        after: guest.castlePoints - TEAM_CREATE_COST_CP,
        source: 'team:create',
        metadata: { teamId, teamName: name },
        ...(callerIp ? { ip: callerIp } : {}),
      })

      // Auto-post a recruit card to the Hall chat so the Castle
      // immediately sees there's a new team looking for members.
      // Written server-side (no postChat rate limit), but the team name
      // is kid-authored text — it was scrubbed above and the card is
      // flagged `reportable` so it can still be community-flagged.
      const recruitMessage: ChatMessageDoc = {
        name: 'Castle',
        uid: '',
        normalizedName: '',
        isBypass: false,
        kind: 'system',
        reportable: true,
        text: `${idData.displayName} just founded a new team: ${name}.`,
        ts: now,
        hostId: hostOnDuty(),
        action: {
          kind: 'team-recruit',
          teamId,
          teamName: name,
          captainDisplayName: idData.displayName,
          memberCount: 1,
          badge,
        },
      }
      tx.create(db.collection('lobby/messages/items').doc(), recruitMessage)
      // Stamp recruit time so the 1-week rate limit on manual reposts
      // counts from the auto-post.
      tx.update(teamRef, { lastRecruitAt: now })

      return {
        teamId,
        castlePoints: guest.castlePoints - TEAM_CREATE_COST_CP,
      }
    })
  },
)
