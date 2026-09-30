// castSkill — kid spends castle points to broadcast a visual effect
// (firework, battle) to everyone currently in the Hall.
//
// ─── PAUSED ────────────────────────────────────────────────────────
// This was Slice 2 of the chat-command sequence; superseded for now
// by the Castle Terminal direction. The callable is fully written
// but intentionally NOT exported from functions/src/index.ts, so it
// doesn't deploy. The ChatMessageAction 'skill' variant in chatTypes
// only exists to let this file compile in the meantime.
//
// To revive: re-export from index.ts, add the client overlay
// renderer, and wire up /cast firework / /cast battle commands in
// the terminal's commandRegistry.
// ───────────────────────────────────────────────────────────────────
//
// Server-side gate:
//   • Caster must be non-bypass, signed-in.
//   • Caster must have enough castle points.
//   • One cast per 10 seconds (per uid) to keep the Hall sane.
// Effect is delivered as a system chat message with action:
//   { kind: 'skill', skillId, casterName, target?, casterBadge?, targetBadge? }
// — clients render it as a full-screen overlay portal, not an inline
// chat bubble. The chat message itself is a thin "Jeff cast firework"
// fallback for kids whose effect layer hasn't loaded.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { ChatMessageDoc } from './chatTypes'
import { hostOnDuty } from '../shared/hostOnDuty'
import { requireOwnedGuest } from './requireOwner'
import type { GuestDoc, TeamBadge } from './types'

const RATE_LIMIT_MS = 10_000

interface Skill {
  costCp: number
  /** What the action.kind.skillId on the chat message says. */
  id: string
  /** Whether @target is required / optional / unused. */
  acceptsTarget: 'no' | 'optional'
  /** Human-readable name for the fallback chat line. */
  label: string
}

const SKILLS: Record<string, Skill> = {
  firework: { costCp: 5,  id: 'firework', acceptsTarget: 'no',       label: 'a firework' },
  battle:   { costCp: 10, id: 'battle',   acceptsTarget: 'optional', label: 'a knight battle' },
}

export interface CastSkillRequest {
  skillId: string
  /** Normalised target name for skills that accept one (battle). */
  target?: string
}
export interface CastSkillResponse {
  ok: true
  castlePoints: number
}

export const castSkill = onCall<CastSkillRequest, Promise<CastSkillResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const skillId = String(req.data?.skillId ?? '').toLowerCase()
    const skill = SKILLS[skillId]
    if (!skill) throw new HttpsError('invalid-argument', `Unknown skill: ${skillId}`)
    const rawTarget = String(req.data?.target ?? '').trim().toLowerCase()
    const target = skill.acceptsTarget === 'no' || !rawTarget ? undefined : rawTarget

    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Sign in with a magic word to cast skills.')
    }

    const now = Date.now()

    // Rate-limit + CP debit inside a single transaction so a fast
    // double-tap can't double-cast.
    const result = await db.runTransaction(async (tx) => {
      const { ref: guestRef, guest } = await requireOwnedGuest(db, uid, idData.normalizedName, tx)
      const lastCast = (guest as GuestDoc & { lastSkillAt?: number }).lastSkillAt ?? 0
      if (now - lastCast < RATE_LIMIT_MS) {
        const wait = Math.ceil((RATE_LIMIT_MS - (now - lastCast)) / 1000)
        throw new HttpsError('failed-precondition', `Wait ${wait}s between casts.`)
      }
      if ((guest.castlePoints ?? 0) < skill.costCp) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${skill.costCp} castle points to cast ${skillId}; you have ${guest.castlePoints ?? 0}.`,
        )
      }
      tx.update(guestRef, {
        castlePoints: FieldValue.increment(-skill.costCp),
        lastSkillAt: now,
      })
      return {
        casterBadge: guest.cosmetics?.avatar as TeamBadge | undefined,
        castlePointsAfter: (guest.castlePoints ?? 0) - skill.costCp,
      }
    })

    // Resolve the target's display name + avatar (best-effort —
    // missing = generic animation).
    let targetDisplay: string | undefined
    let targetBadge: TeamBadge | undefined
    if (target) {
      const tSnap = await db.doc(`guests/${target}`).get()
      if (tSnap.exists) {
        const t = tSnap.data() as GuestDoc
        targetDisplay = t.displayName
        targetBadge = t.cosmetics?.avatar
      }
    }

    const fallbackText = target && targetDisplay
      ? `${idData.displayName} cast ${skill.label} at ${targetDisplay}.`
      : `${idData.displayName} cast ${skill.label}.`
    const msg: ChatMessageDoc = {
      name: 'Castle',
      uid: '',
      normalizedName: '',
      isBypass: false,
      kind: 'system',
      text: fallbackText,
      ts: now,
      hostId: hostOnDuty(now),
      action: {
        kind: 'skill',
        skillId: skill.id,
        casterName: idData.displayName,
        ...(targetDisplay ? { targetName: targetDisplay } : {}),
        ...(result.casterBadge ? { casterBadge: result.casterBadge } : {}),
        ...(targetBadge ? { targetBadge } : {}),
      },
    }
    await db.collection('lobby/messages/items').add(msg)

    return { ok: true as const, castlePoints: result.castlePointsAfter }
  },
)
