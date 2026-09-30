// forgetMe — server-side "delete my account and data" (right to be forgotten).
//
// Irreversible. Erases everything tied to a signed-in guest across Firestore:
// team membership (disband if captain), current-tournament entry, authored
// chat messages, authored feedback, forest leaderboard row, per-uid shadow
// identities, archived games, castle-point audit rows, invitations and team
// applications naming the guest, then the guest doc itself, and finally the
// Firebase Auth users behind every uid. The client wipes all local data
// separately after this resolves.
//
// Still NOT purged (2026-09-29): rooms/{id} and wizard_rooms/{id} keep the
// player's display name + uid (and wizard_rooms/{id}/messages keeps their
// text/voice clips) and games/{roomId} global finished-game records name
// both players — anonymising those is Phase 1; castle_enter_attempts*
// rate-limit counters (one keyed by the name); past-week tournaments docs;
// forest_runs / story_quiz_attempts / chat_flags rows keyed by uid.
//
// Auth: the caller must own the account — guest.uids must include their uid.
// Steps are best-effort and independent so one failure can't strand the rest;
// the guest doc is deleted LAST because the team/tournament steps read it.

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, type Query, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import { disbandTeamTx } from '../teams/disbandHelpers'
import { tournamentWeekKey } from '../tournament/weekKey'
import type { GuestDoc, TeamDoc } from './types'

export interface ForgetMeRequest {
  normalizedName: string
}
export interface ForgetMeResponse {
  ok: boolean
  deleted: {
    teams: number
    tournaments: number
    chatMessages: number
    feedback: number
    games: number
    identities: number
    auditRows: number
    invitations: number
    applications: number
    authUsers: number
  }
}

const CHUNK = 400

/** Delete every doc matched by a query, paginated so large sets don't OOM. */
async function deleteQuery(db: Firestore, query: Query): Promise<number> {
  let total = 0
  for (;;) {
    const snap = await query.limit(CHUNK).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    total += snap.size
    if (snap.size < CHUNK) break
  }
  return total
}

export const forgetMe = onCall<ForgetMeRequest, Promise<ForgetMeResponse>>(APP_CHECK,async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const uid = req.auth.uid
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  if (!normalizedName || normalizedName.includes('/')) {
    throw new HttpsError('invalid-argument', 'Missing or invalid name.')
  }

  const db = getFirestore()
  const guestRef = db.doc(`guests/${normalizedName}`)
  const guestSnap = await guestRef.get()
  if (!guestSnap.exists) throw new HttpsError('not-found', 'No such guest.')
  const guest = guestSnap.data() as GuestDoc
  if (!Array.isArray(guest.uids) || !guest.uids.includes(uid)) {
    throw new HttpsError('permission-denied', 'You can only delete your own data.')
  }
  const uids = guest.uids
  const teamIds = Array.isArray(guest.teamIds) ? guest.teamIds : []

  const deleted = {
    teams: 0, tournaments: 0, chatMessages: 0, feedback: 0, games: 0, identities: 0,
    auditRows: 0, invitations: 0, applications: 0, authUsers: 0,
  }

  // 1. Teams — disband if captain (or last member), else drop from the roster.
  for (const teamId of teamIds) {
    try {
      await db.runTransaction(async (tx) => {
        const teamRef = db.doc(`teams/${teamId}`)
        const teamSnap = await tx.get(teamRef)
        if (!teamSnap.exists) return
        const team = teamSnap.data() as TeamDoc
        if (team.captainNormalizedName === normalizedName || team.memberCount <= 1) {
          await disbandTeamTx(tx, team, db)
        } else {
          const nextMembers = team.members.filter((m) => m.normalizedName !== normalizedName)
          tx.update(teamRef, { members: nextMembers, memberCount: nextMembers.length, lastChangeAt: Date.now() })
        }
      })
      deleted.teams++
    } catch { /* best-effort */ }
  }

  // 2. Current weekly tournament — remove from participants.
  try {
    const tRef = db.doc(`tournaments/${tournamentWeekKey()}`)
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(tRef)
      if (!snap.exists) return
      const data = snap.data() as { participants?: Array<{ normalizedName: string }> }
      const participants = data.participants ?? []
      if (!participants.some((p) => p.normalizedName === normalizedName)) return
      tx.update(tRef, { participants: participants.filter((p) => p.normalizedName !== normalizedName) })
      deleted.tournaments = 1
    })
  } catch { /* best-effort */ }

  // 3. Authored chat messages.
  try {
    deleted.chatMessages = await deleteQuery(
      db, db.collection('lobby/messages/items').where('normalizedName', '==', normalizedName),
    )
  } catch { /* best-effort */ }

  // 4. Authored feedback.
  try {
    deleted.feedback = await deleteQuery(
      db, db.collection('feedback').where('authorNormalizedName', '==', normalizedName),
    )
  } catch { /* best-effort */ }

  // 5. Forest leaderboard row.
  try { await db.doc(`forest_leaderboard/${normalizedName}`).delete() } catch { /* best-effort */ }
  try { await db.doc(`siege_scores/${normalizedName}`).delete() } catch { /* best-effort */ }

  // 6. Per-uid shadow identities.
  for (const u of uids) {
    try { await db.doc(`chat_identity/${u}`).delete(); deleted.identities++ } catch { /* best-effort */ }
  }

  // 7. Archived games subcollection.
  try {
    deleted.games = await deleteQuery(db, db.collection(`guests/${normalizedName}/games`))
  } catch { /* best-effort */ }

  // 8. Castle-point audit ledger rows (carry the name + hashed IP).
  try {
    deleted.auditRows = await deleteQuery(
      db, db.collection('castle_point_audit').where('normalizedName', '==', normalizedName),
    )
  } catch { /* best-effort */ }

  // 9. Invitations sent or received, and team applications sent.
  for (const field of ['fromNormalizedName', 'toNormalizedName']) {
    try {
      deleted.invitations += await deleteQuery(
        db, db.collection('invitations').where(field, '==', normalizedName),
      )
    } catch { /* best-effort */ }
  }
  try {
    deleted.applications = await deleteQuery(
      db, db.collection('team_applications').where('fromNormalizedName', '==', normalizedName),
    )
  } catch { /* best-effort */ }

  // 10. The guest doc itself — last of the Firestore steps (steps above read it).
  await guestRef.delete()

  // 11. Firebase Auth users behind every device uid — after the Firestore
  // purge so a failure here can't leave data behind a still-valid login.
  // The caller's own current ID token stays valid until it expires; the
  // client signs out / re-signs in anonymously after this resolves.
  const auth = getAuth()
  for (const u of uids) {
    try { await auth.deleteUser(u); deleted.authUsers++ } catch { /* best-effort */ }
  }

  return { ok: true, deleted }
})
