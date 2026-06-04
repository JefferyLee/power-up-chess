// Captain-only mutations on a team: transfer the title, kick a
// member, rename, change the badge, repost the recruit card.
//
// rename / rebadge / postRecruitment each carry a 1-per-week rate
// limit — captain can't spam the Hall with re-skins or recruit blasts.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { ChatMessageDoc } from '../castle/chatTypes'
import { hostOnDuty } from '../shared/hostOnDuty'
import { type GuestDoc, type TeamBadge, type TeamDoc } from '../castle/types'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const NAME_MIN = 2
const NAME_MAX = 30
const MOTTO_MAX = 60

function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
function sanitiseName(raw: string): string {
  return raw.replace(/[ -]/g, '').trim().slice(0, NAME_MAX)
}
function colour(s: unknown): string | undefined {
  return typeof s === 'string' && /^#[0-9a-f]{3,8}$/i.test(s) ? s : undefined
}
function sanitiseBadge(raw: TeamBadge | undefined): TeamBadge {
  const allowedShapes = ['shield-heater', 'shield-round', 'shield-pointed', 'roundel']
  const allowedLayouts = ['solid', 'horizontal', 'vertical', 'quartered']
  return {
    shape: allowedShapes.includes(String(raw?.shape)) ? raw!.shape : 'shield-heater',
    layout: allowedLayouts.includes(String(raw?.layout)) ? raw!.layout : 'solid',
    bg: colour(raw?.bg) ?? '#3a5b9c',
    bg2: colour(raw?.bg2),
    border: colour(raw?.border) ?? '#1a1530',
    symbol: typeof raw?.symbol === 'string' && raw.symbol.length <= 24 ? raw.symbol : 'king',
    symbolColor: colour(raw?.symbolColor) ?? '#f4c266',
  }
}

// ─── transferCaptain ──────────────────────────────────────────────────

export interface TransferCaptainRequest {
  teamId: string
  toNormalizedName: string
}
export interface TransferCaptainResponse { ok: true }

export const transferCaptain = onCall<TransferCaptainRequest, Promise<TransferCaptainResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    const toNormalizedName = String(req.data?.toNormalizedName ?? '').trim().toLowerCase()
    if (!teamId || !toNormalizedName) {
      throw new HttpsError('invalid-argument', 'teamId + toNormalizedName required.')
    }

    const db = getFirestore()
    const teamRef = db.doc(`teams/${teamId}`)
    const guestRef = db.doc(`guests/${toNormalizedName}`)

    return db.runTransaction(async (tx) => {
      const [teamSnap, guestSnap] = await Promise.all([tx.get(teamRef), tx.get(guestRef)])
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the current captain can transfer.')
      }
      const target = team.members.find((m) => m.normalizedName === toNormalizedName)
      if (!target) {
        throw new HttpsError('failed-precondition', 'Target is not on the team.')
      }
      if (toNormalizedName === team.captainNormalizedName) {
        return { ok: true as const }  // already them — idempotent
      }
      if (!guestSnap.exists) {
        throw new HttpsError('failed-precondition', 'Target guest record missing.')
      }
      const targetGuest = guestSnap.data() as GuestDoc
      const targetUid = Array.isArray(targetGuest.uids) ? targetGuest.uids[0] : undefined
      if (!targetUid) {
        throw new HttpsError('failed-precondition', 'Target has no uid on file.')
      }
      tx.update(teamRef, {
        captainUid: targetUid,
        captainNormalizedName: toNormalizedName,
        captainDisplayName: target.displayName,
      })
      return { ok: true as const }
    })
  },
)

// ─── kickMember ────────────────────────────────────────────────────────

export interface KickMemberRequest {
  teamId: string
  normalizedName: string
}
export interface KickMemberResponse { ok: true }

export const kickMember = onCall<KickMemberRequest, Promise<KickMemberResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    const targetNormalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    if (!teamId || !targetNormalizedName) {
      throw new HttpsError('invalid-argument', 'teamId + normalizedName required.')
    }

    const db = getFirestore()
    const teamRef = db.doc(`teams/${teamId}`)
    const targetGuestRef = db.doc(`guests/${targetNormalizedName}`)

    return db.runTransaction(async (tx) => {
      const [teamSnap, targetSnap] = await Promise.all([tx.get(teamRef), tx.get(targetGuestRef)])
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can kick.')
      }
      if (targetNormalizedName === team.captainNormalizedName) {
        throw new HttpsError('failed-precondition', "You can't kick yourself — transfer or disband instead.")
      }
      if (!team.members.some((m) => m.normalizedName === targetNormalizedName)) {
        throw new HttpsError('failed-precondition', 'Target is not on the team.')
      }
      const nextMembers = team.members.filter((m) => m.normalizedName !== targetNormalizedName)
      tx.update(teamRef, {
        members: nextMembers,
        memberCount: nextMembers.length,
        lastChangeAt: Date.now(),
      })
      if (targetSnap.exists) {
        tx.update(targetGuestRef, { teamIds: FieldValue.arrayRemove(teamId) })
      }
      return { ok: true as const }
    })
  },
)

// ─── renameTeam ────────────────────────────────────────────────────────

export interface RenameTeamRequest {
  teamId: string
  name: string
  motto?: string
}
export interface RenameTeamResponse { ok: true; name: string }

export const renameTeam = onCall<RenameTeamRequest, Promise<RenameTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    if (!teamId) throw new HttpsError('invalid-argument', 'teamId required.')
    const newName = sanitiseName(String(req.data?.name ?? ''))
    if (newName.length < NAME_MIN) {
      throw new HttpsError('invalid-argument', `Team name needs at least ${NAME_MIN} characters.`)
    }
    const newNormalized = normalizeTeamName(newName)
    const motto = String(req.data?.motto ?? '').trim().slice(0, MOTTO_MAX)

    const db = getFirestore()
    const teamRef = db.doc(`teams/${teamId}`)

    return db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef)
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can rename.')
      }
      const now = Date.now()
      if (team.lastRenamedAt && now - team.lastRenamedAt < WEEK_MS) {
        const days = Math.ceil((WEEK_MS - (now - team.lastRenamedAt)) / (24 * 60 * 60 * 1000))
        throw new HttpsError('failed-precondition', `Renamed too recently — try again in ${days} day(s).`)
      }

      // Name lock — if the normalized name actually changed, swap locks.
      const updates: Partial<TeamDoc> = {
        name: newName,
        motto: motto || undefined,
        lastRenamedAt: now,
      }
      if (newNormalized !== team.normalizedName) {
        const newLockRef = db.doc(`team_names/${encodeURIComponent(newNormalized)}`)
        const oldLockRef = db.doc(`team_names/${encodeURIComponent(team.normalizedName)}`)
        const newLockSnap = await tx.get(newLockRef)
        if (newLockSnap.exists) {
          throw new HttpsError('already-exists', `Team name "${newName}" is already taken.`)
        }
        tx.create(newLockRef, { teamId, normalizedTeamName: newNormalized, createdAt: now })
        tx.delete(oldLockRef)
        updates.normalizedName = newNormalized
      }
      tx.update(teamRef, updates)
      return { ok: true as const, name: newName }
    })
  },
)

// ─── rebadgeTeam ───────────────────────────────────────────────────────

export interface RebadgeTeamRequest {
  teamId: string
  badge: TeamBadge
}
export interface RebadgeTeamResponse { ok: true }

export const rebadgeTeam = onCall<RebadgeTeamRequest, Promise<RebadgeTeamResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const teamId = String(req.data?.teamId ?? '').trim()
    if (!teamId) throw new HttpsError('invalid-argument', 'teamId required.')
    const badge = sanitiseBadge(req.data?.badge)

    const db = getFirestore()
    const teamRef = db.doc(`teams/${teamId}`)

    return db.runTransaction(async (tx) => {
      const teamSnap = await tx.get(teamRef)
      if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found.')
      const team = teamSnap.data() as TeamDoc
      if (team.captainUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the captain can change the badge.')
      }
      const now = Date.now()
      if (team.lastRebadgedAt && now - team.lastRebadgedAt < WEEK_MS) {
        const days = Math.ceil((WEEK_MS - (now - team.lastRebadgedAt)) / (24 * 60 * 60 * 1000))
        throw new HttpsError('failed-precondition', `Badge changed too recently — try again in ${days} day(s).`)
      }
      tx.update(teamRef, { badge, lastRebadgedAt: now })
      return { ok: true as const }
    })
  },
)

// ─── postTeamRecruitment ───────────────────────────────────────────────
//
// Captain reposts the recruit card to the Hall. Same shape as the
// auto-post in createTeam. Rate-limited to once a week so the chat
// doesn't get spammed by overzealous captains.

export interface PostTeamRecruitmentRequest { teamId: string }
export interface PostTeamRecruitmentResponse { ok: true }

export const postTeamRecruitment = onCall<PostTeamRecruitmentRequest, Promise<PostTeamRecruitmentResponse>>(
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
        throw new HttpsError('permission-denied', 'Only the captain can post recruit cards.')
      }
      const now = Date.now()
      if (team.lastRecruitAt && now - team.lastRecruitAt < WEEK_MS) {
        const days = Math.ceil((WEEK_MS - (now - team.lastRecruitAt)) / (24 * 60 * 60 * 1000))
        throw new HttpsError('failed-precondition', `Recruit posted too recently — try again in ${days} day(s).`)
      }
      const msg: ChatMessageDoc = {
        name: 'Castle',
        uid: '',
        normalizedName: '',
        isBypass: false,
        kind: 'system',
        text: `${team.captainDisplayName}'s team "${team.name}" is recruiting.`,
        ts: now,
        hostId: hostOnDuty(),
        action: {
          kind: 'team-recruit',
          teamId,
          teamName: team.name,
          captainDisplayName: team.captainDisplayName,
          memberCount: team.memberCount,
          badge: team.badge,
        },
      }
      tx.create(db.collection('lobby/messages/items').doc(), msg)
      tx.update(teamRef, { lastRecruitAt: now })
    })
    return { ok: true as const }
  },
)
