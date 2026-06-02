// postChat — accept a user message, scrub it, rate-limit it, write to
// lobby/messages. When the message mentions @host/@Lucy/@Luca, fire the
// (separate) hostChatReply path so a host reply lands shortly after.
//
// The caller's identity (displayName, normalizedName, isBypass) lives in
// their sessionStorage and is sent in the request. We re-verify it server-
// side: non-bypass callers must have a guest doc whose uids[] contains the
// caller's auth uid.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { CHAT_LIMITS, type ChatMessageDoc, type PostChatRequest, type PostChatResponse } from './chatTypes'
import { bumpAndCheck } from './chatRateLimit'
import { scrubMessage } from './profanity'
import { generateHostReply, GEMINI_API_KEY, mentionedHost } from './hostChatReply'
import type { GuestDoc } from './types'

/** Cost per Hall message, in castle points. Kids who can't earn yet
 *  (bypass guests) skip this — they have no balance. Designed to nudge
 *  toward listening to stories + answering quizzes rather than chatting. */
const HALL_CHAT_COST = 1

const GENERIC_REPLY = 'I just listened in.'

export const postChat = onCall<PostChatRequest, Promise<PostChatResponse>>(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before chatting.')
    const uid = req.auth.uid

    const text = String(req.data?.text ?? '').trim()
    if (text.length === 0) return { status: 'empty' }
    if (text.length > CHAT_LIMITS.textMaxChars) return { status: 'too-long' }

    // Rate-limit: burst (per minute) AND sustained (per 5 minutes).
    // Worst-case lockout is 5 minutes; we no longer day-cap.
    const min = await bumpAndCheck(uid, 'chat-min', CHAT_LIMITS.messagesPerMinute)
    if (!min.allowed) return { status: 'rate-limited', retryAfterMs: min.retryAfterMs }
    const fiveMin = await bumpAndCheck(uid, 'chat-5min', CHAT_LIMITS.messagesPer5Min)
    if (!fiveMin.allowed) return { status: 'rate-limited', retryAfterMs: fiveMin.retryAfterMs }

    // Resolve identity from sessionStorage-mirrored shadow doc (chat_identity/{uid}).
    // Falls back to a basic bypass-ish identity if no shadow exists yet — the
    // setPresence call lands first in the normal flow.
    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean; hostId: 'lucy' | 'luca' }
      | undefined
    if (!idData) {
      throw new HttpsError('failed-precondition', 'Set presence before chatting.')
    }
    const { displayName, normalizedName, isBypass, hostId } = idData

    // For non-bypass callers, verify the guest doc + uids[] AND charge
    // 1 castle point per message. Bypass guests get to chat for free
    // since they have no persistent balance.
    let guestRefForDeduct: FirebaseFirestore.DocumentReference | null = null
    let hasHalo = false
    if (!isBypass) {
      const guestRef = db.doc(`guests/${normalizedName}`)
      const gSnap = await guestRef.get()
      const guest = gSnap.data() as GuestDoc | undefined
      if (!guest || !guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only post as yourself.')
      }
      if (guest.castlePoints < HALL_CHAT_COST) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${HALL_CHAT_COST} castle point to send a message; earn some with puzzles or quizzes.`,
        )
      }
      guestRefForDeduct = guestRef
      const halo = guest.cosmetics?.duelWinnerExpiresAt
      hasHalo = typeof halo === 'number' && halo > Date.now()
    }

    const scrub = scrubMessage(text)

    // Deduct cost atomically (FieldValue.increment avoids a read-write race
    // if two posts arrive back-to-back). We already verified balance ≥ cost
    // above, but the per-minute rate limit makes a real-world underflow
    // here implausible enough to ignore.
    if (guestRefForDeduct) {
      await guestRefForDeduct.update({ castlePoints: FieldValue.increment(-HALL_CHAT_COST) })
    }

    const msg: ChatMessageDoc = {
      name: displayName,
      uid,
      normalizedName,
      isBypass,
      kind: 'user',
      text: scrub.text,
      ts: Date.now(),
      ...(hasHalo ? { hasHalo: true } : {}),
    }
    const ref = await db.collection('lobby/messages/items').add(msg)

    // Host-mention reply: synchronous so the reply lands right after the
    // user message. Bounded by an internal timeout in generateHostReply.
    const hostMention = mentionedHost(scrub.text)
    let hostReplyPending = false
    if (hostMention) {
      hostReplyPending = true
      try {
        const reply = await generateHostReply({
          hostId,
          messageHistory: await loadRecentHistory(db, 6),
          userMessage: scrub.text,
          userName: displayName,
          callerUid: uid,
        })
        const hostMsg: ChatMessageDoc = {
          name: hostNameFor(hostId),
          uid: '',
          normalizedName: '',
          isBypass: false,
          kind: 'host',
          hostId,
          text: reply ?? GENERIC_REPLY,
          ts: Date.now(),
        }
        await db.collection('lobby/messages/items').add(hostMsg)
      } catch (err) {
        console.warn('hostChatReply failed:', err)
        const hostMsg: ChatMessageDoc = {
          name: hostNameFor(hostId),
          uid: '',
          normalizedName: '',
          isBypass: false,
          kind: 'host',
          hostId,
          text: GENERIC_REPLY,
          ts: Date.now(),
        }
        await db.collection('lobby/messages/items').add(hostMsg)
      }
    }

    return { status: 'ok', messageId: ref.id, censored: scrub.censored, hostReplyPending }
  },
)

function hostNameFor(hostId: 'lucy' | 'luca'): string {
  return hostId === 'lucy' ? 'Lucy' : 'Luca'
}

async function loadRecentHistory(
  db: FirebaseFirestore.Firestore,
  n: number,
): Promise<Array<{ role: 'host' | 'user'; name: string; text: string }>> {
  const snap = await db
    .collection('lobby/messages/items')
    .orderBy('ts', 'desc')
    .limit(n)
    .get()
  return snap.docs
    .map((d) => d.data() as ChatMessageDoc)
    .reverse()
    .map((m) => ({
      role: m.kind === 'host' ? ('host' as const) : ('user' as const),
      name: m.name,
      text: m.text,
    }))
}
