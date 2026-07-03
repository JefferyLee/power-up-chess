// reportChatMessage — kid-facing "report this message" for the Great Hall.
//
// Community moderation to complement the server-side profanity scrub + rate
// limit that already run at post time: any signed-in guest can flag a user
// message; once THREE distinct users have flagged it, the message auto-hides
// (`hidden: true`, which useLobbyChat already filters out client-side).
//
// Reporter identity is kept OFF the public message doc (which any authed
// client can read) — dedup lives in a separate chat_flags/{messageId}__{uid}
// doc, and only an aggregate `flags` count is written back to the message.

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { bumpAndCheck } from './chatRateLimit'

/** Distinct reporters needed to auto-hide a message. */
const FLAG_THRESHOLD = 3
/** Generous per-day cap so a kid can't spam-flag the whole hall. */
const REPORTS_PER_DAY = 20

export interface ReportChatRequest {
  messageId: string
}
export interface ReportChatResponse {
  ok: boolean
  hidden: boolean
  flags: number
  /** True when this user had already reported this message (no-op). */
  already?: boolean
}

export const reportChatMessage = onCall<ReportChatRequest, Promise<ReportChatResponse>>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in to report a message.')
  }
  const uid = req.auth.uid
  const messageId = (req.data?.messageId ?? '').toString().trim()
  if (!messageId || messageId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Missing or invalid messageId.')
  }

  const gate = await bumpAndCheck(uid, 'report-day', REPORTS_PER_DAY)
  if (!gate.allowed) {
    throw new HttpsError('resource-exhausted', 'That’s a lot of reports for one day — please try again later.')
  }

  const db = getFirestore()
  const msgRef = db.doc(`lobby/messages/items/${messageId}`)
  const flagRef = db.doc(`chat_flags/${messageId}__${uid}`)

  return db.runTransaction(async (tx) => {
    const [msgSnap, flagSnap] = await Promise.all([tx.get(msgRef), tx.get(flagRef)])
    if (!msgSnap.exists) {
      throw new HttpsError('not-found', 'That message is no longer here.')
    }
    const msg = msgSnap.data() as {
      hidden?: boolean; flags?: number; kind?: string
      viaWizard?: string; wizardMessageId?: string
    }
    const flags0 = typeof msg.flags === 'number' ? msg.flags : 0

    if (msg.hidden) return { ok: true, hidden: true, flags: flags0 }
    if (flagSnap.exists) return { ok: true, hidden: false, flags: flags0, already: true }
    // Only real user chatter is community-moderated; host/system lines are ours.
    if (msg.kind !== 'user') {
      throw new HttpsError('failed-precondition', 'This message can’t be reported.')
    }

    const flags = flags0 + 1
    const hidden = flags >= FLAG_THRESHOLD
    tx.set(flagRef, { uid, messageId, ts: Date.now() })
    tx.update(msgRef, hidden ? { flags, hidden: true } : { flags })
    // Phase 1.1/1.3 — hiding a Wizard mirror also hides the SOURCE message
    // inside the duel room, so the content disappears everywhere at once.
    if (hidden && msg.viaWizard && msg.wizardMessageId && !msg.viaWizard.includes('/') && !msg.wizardMessageId.includes('/')) {
      tx.update(db.doc(`wizard_rooms/${msg.viaWizard}/messages/${msg.wizardMessageId}`), { hidden: true })
    }
    return { ok: true, hidden, flags }
  })
})
