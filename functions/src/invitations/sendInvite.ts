// Send a chess invitation from one castle guest to another.
//
// Charges the sender 5 CP (INVITE_COST_CP) up-front whether or not the
// recipient ever accepts — same economics as opening a private room via
// the createRoom callable, since on accept we re-use that 5 CP to spawn
// the room.
//
// Recipient liveness ("are they online? in a game?") is a UI-level check
// at the sender's User Card. The server intentionally does NOT block on
// presence — the kid might be in a game, the invite still arrives, the
// recipient's client filters / queues it. This keeps the callable simple
// and avoids races where a kid joins a game half a second before the
// invite lands.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import { sanitisePieceSetId } from '../cosmetics/registry'
import { consumeDailyQuota } from '../llm/rateLimit'
import { sanitiseTimeControl } from '../rooms/sanitiseTimeControl'
import type { TimeControl } from '../rooms/types'
import { wizardGateMinPoints } from '../games/wizard/wizardGate'
import {
  INVITE_COST_CP,
  INVITE_DAILY_LIMIT,
  INVITE_TTL_MS,
  WIZARD_INVITE_COST_CP,
  type InvitationDoc,
} from './types'
import { appendAuditTx } from '../castle/audit'
import { extractIp } from '../castle/ipGeo'
import { requireOwnedGuest } from '../castle/requireOwner'

export interface SendInviteRequest {
  fromNormalizedName: string
  toNormalizedName: string
  timeControl: TimeControl | null
  pieceSetId?: string
  /** Game variant to spawn on accept. Omitted = 'chess' for back-compat
   *  with clients written before wizard invites existed. */
  kind?: 'chess' | 'wizard'
}

export interface SendInviteResponse {
  ok: true
  inviteId: string
  /** UTC ms; the client can countdown the 60 s decision window. */
  expiresAt: number
}

export const sendInvite = onCall<SendInviteRequest, Promise<SendInviteResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before sending an invitation.')
    }
    const fromNormalized = String(req.data?.fromNormalizedName ?? '').trim().toLowerCase()
    const toNormalized = String(req.data?.toNormalizedName ?? '').trim().toLowerCase()
    if (!fromNormalized || !toNormalized) {
      throw new HttpsError('invalid-argument', 'Both fromNormalizedName and toNormalizedName are required.')
    }
    if (fromNormalized === toNormalized) {
      throw new HttpsError('invalid-argument', 'You can\'t invite yourself.')
    }
    const kind: 'chess' | 'wizard' =
      req.data?.kind === 'wizard' ? 'wizard' : 'chess'
    // Wizard duels run a fixed clock and ignore any time-control the
    // sender passes in; chess invites carry the picked preset through.
    const timeControl = kind === 'wizard'
      ? null
      : sanitiseTimeControl(req.data?.timeControl ?? null)
    const fromPieceSetId = sanitisePieceSetId(req.data?.pieceSetId)
    const cost = kind === 'wizard' ? WIZARD_INVITE_COST_CP : INVITE_COST_CP

    const db = getFirestore()
    const toRef = db.doc(`guests/${toNormalized}`)

    // Daily rate limit — same per-uid pattern as the feedback/commentary
    // limiters. The 5 CP cost is the primary deterrent; this is a backstop
    // against runaway clients (e.g. retry loops on a broken UI).
    await consumeDailyQuota(req.auth.uid, {
      collection: 'invite_attempts',
      limit: INVITE_DAILY_LIMIT,
      noun: 'invitations',
    })

    // Transaction: read both guest docs, verify, charge sender, create invite.
    const invitesCol = db.collection('invitations')
    const inviteRef = invitesCol.doc() // auto id

    const now = Date.now()
    const expiresAt = now + INVITE_TTL_MS
    // Pick the host server-side so neither client can spoof a preference.
    const hostMode: 'lucy' | 'luca' = Math.random() < 0.5 ? 'lucy' : 'luca'
    const callerIp = extractIp(req)

    // Wizard's Duel has its own castle-points entry threshold (1000 +
    // dynamic top-10% floor). Pre-fetch the gate before the txn so we
    // can fail fast — same shape as createWizardRoom does it.
    const wizardGate = kind === 'wizard' ? await wizardGateMinPoints(db) : 0

    const result = await db.runTransaction(async (tx) => {
      const { ref: fromRef, guest: fromGuest } = await requireOwnedGuest(
        db, req.auth!.uid, fromNormalized, tx,
      )
      if (fromGuest.castlePoints < cost) {
        throw new HttpsError(
          'failed-precondition',
          `You need ${cost} castle points to send this invitation. You have ${fromGuest.castlePoints}.`,
        )
      }
      if (kind === 'wizard' && fromGuest.castlePoints < wizardGate) {
        throw new HttpsError(
          'failed-precondition',
          `Wizard's Duel unlocks at ${wizardGate} castle points; you have ${fromGuest.castlePoints}. Solve puzzles or win chess games to earn more.`,
        )
      }

      const toSnap = await tx.get(toRef)
      if (!toSnap.exists) {
        throw new HttpsError('not-found', 'That guest doesn\'t exist.')
      }
      const toGuest = toSnap.data() as GuestDoc
      // Don't waste 10 CP on a wizard invite the recipient can't accept.
      // Reject up-front when the target is below the gate; the same
      // check runs again on respondInvite as defence in depth.
      if (kind === 'wizard' && toGuest.castlePoints < wizardGate) {
        throw new HttpsError(
          'failed-precondition',
          `${toGuest.displayName} needs ${wizardGate} castle points for Wizard's Duel and only has ${toGuest.castlePoints}.`,
        )
      }
      const allUids = toGuest.uids ?? []
      if (allUids.length === 0) {
        throw new HttpsError('failed-precondition', 'Recipient has never signed in.')
      }
      // Anonymous Auth mints a fresh uid per browser/device — the same
      // magic-word can collect dozens over the kid's lifetime. Cap to
      // the most-recent 10 so doc size stays modest while still
      // covering the realistic "iPad + iPhone + laptop" multi-device
      // case. The freshest is at the end of the array (uids are
      // appended on castleEnter).
      const toUids = allUids.slice(-10)
      const toUid = toUids[toUids.length - 1]!

      const doc: InvitationDoc = {
        inviteId: inviteRef.id,
        kind,
        fromUid: req.auth!.uid,
        fromName: fromGuest.displayName,
        fromNormalizedName: fromNormalized,
        toUid,
        toUids,
        toName: toGuest.displayName,
        toNormalizedName: toNormalized,
        timeControl,
        hostMode,
        status: 'pending',
        createdAt: now,
        expiresAt,
        ...(fromPieceSetId ? { fromPieceSetId } : {}),
      }

      tx.update(fromRef, { castlePoints: FieldValue.increment(-cost) })
      tx.create(inviteRef, doc)
      appendAuditTx(tx, {
        normalizedName: fromNormalized,
        uid: req.auth!.uid,
        delta: -cost,
        before: fromGuest.castlePoints,
        after: fromGuest.castlePoints - cost,
        source: kind === 'wizard' ? 'invite:send:wizard' : 'invite:send',
        metadata: { inviteId: inviteRef.id, toNormalizedName: toNormalized, kind },
        ...(callerIp ? { ip: callerIp } : {}),
      })
      return { inviteId: inviteRef.id, expiresAt }
    })

    return { ok: true, inviteId: result.inviteId, expiresAt: result.expiresAt }
  },
)
