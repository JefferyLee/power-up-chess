// forgetMe — server-side "delete my account and data" (right to be forgotten).
//
// Irreversible. Erases everything tied to a signed-in guest across Firestore:
// team membership (disband if captain), current-tournament entry, authored
// chat messages, authored feedback, forest leaderboard row, per-uid shadow
// identities, archived games, and finally the guest doc itself. The client
// wipes all local data separately after this resolves.
//
// Auth: the caller must own the account — guest.uids must include their uid.
// Steps are best-effort and independent so one failure can't strand the rest;
// the guest doc is deleted LAST because the team/tournament steps read it.

import { getFirestore, type Query, type Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
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

export const forgetMe = onCall<ForgetMeRequest, Promise<ForgetMeResponse>>({ enforceAppCheck: false },async (req) => {
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

  const deleted = { teams: 0, tournaments: 0, chatMessages: 0, feedback: 0, games: 0, identities: 0 }

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

  // 8. The guest doc itself — last (steps above read it).
  await guestRef.delete()

  return { ok: true, deleted }
})
