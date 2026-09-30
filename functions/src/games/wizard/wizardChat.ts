// Per-duel chat. Message docs live under the room, but every text/voice
// post is ALSO mirrored into the Hall feed (Phase 1.1/1.2) so nothing in
// a Wizard duel is room-private: parents/moderators see it, the report →
// auto-hide pipeline covers it. Both the two players AND spectators can
// post; spectators pay a higher price per message to keep the duel's
// chat focused.
//
// Storage: wizard_rooms/{roomId}/messages/{messageId}
// Cost:    1 / 5 pt for players (text / voice), 2 / 20 pt for spectators.
//          Charged atomically with the message write so we never debit
//          without posting or vice versa.
// Limits:  6 messages / minute / room — keeps bursty spam quiet even
//          when the speaker has plenty of points.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../../callableOptions'
import { scrubMessage } from '../../castle/profanity'
import type { GuestDoc } from '../../castle/types'
import type { ChatMessageDoc } from '../../castle/chatTypes'

const MAX_CHARS = 240
const PER_MIN_CAP = 6
const MIN_WINDOW_MS = 60 * 1000

const TEXT_COST_PLAYER = 1
const TEXT_COST_SPECTATOR = 2
const VOICE_COST_PLAYER = 5
const VOICE_COST_SPECTATOR = 20

const MAX_VOICE_MS = 15_000
const MIN_VOICE_MS = 300
// 200 KB base64 ≈ 150 KB raw audio — plenty of headroom for 15 s opus
// at 32 kbps (~60 KB raw) while staying well under Firestore's 1 MB
// per-document limit even after all the other doc fields.
const MAX_VOICE_BYTES_BASE64 = 200_000
const ALLOWED_VOICE_MIMES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])

interface CallerProfile {
  displayName: string
  normalizedName: string
  isBypass: boolean
  role: 'player' | 'spectator'
  color: 'w' | 'b' | null
}

interface PostRequest {
  roomId: string
  text: string
}
interface PostResponse {
  status: 'ok'
  messageId: string
  censored: boolean
  castlePoints: number
}

interface WizardRoomLite {
  white: { uid: string; displayName: string; normalizedName: string; isBypass: boolean }
  black: { uid: string; displayName: string; normalizedName: string; isBypass: boolean } | null
  status: 'waiting' | 'live' | 'completed'
}

interface RateDoc {
  minStart: number
  minCount: number
}

interface PostVoiceRequest {
  roomId: string
  audioBase64: string
  mimeType: string
  durationMs: number
}
interface PostVoiceResponse {
  status: 'ok'
  messageId: string
  castlePoints: number
}

export const postWizardMessage = onCall<PostRequest, Promise<PostResponse>>(APP_CHECK,
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const roomId = String(req.data?.roomId ?? '')
    const rawText = String(req.data?.text ?? '')
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    const text = rawText.trim()
    if (!text) throw new HttpsError('invalid-argument', 'Empty message.')
    if (text.length > MAX_CHARS) throw new HttpsError('invalid-argument', `Message > ${MAX_CHARS} chars.`)

    const db = getFirestore()
    const rateRef = db.doc(`wizard_rooms/${roomId}/rate_limits/${uid}`)

    // Resolve caller identity. Players are read straight off the room
    // doc; spectators come from the chat_identity shadow (set by
    // setPresence). Either way we end up with displayName + normalizedName
    // and a role/color tag that gets stamped on the message.
    const callerPre = await resolveCaller(uid, roomId)

    // Everything that touches castle points must be transactional with the
    // message write so we never charge without posting (or vice versa).
    return db.runTransaction(async (tx) => {
      const cost = callerPre.role === 'player' ? TEXT_COST_PLAYER : TEXT_COST_SPECTATOR

      const guestRef = db.doc(`guests/${callerPre.normalizedName}`)
      const guestSnap = await tx.get(guestRef)
      if (!guestSnap.exists) throw new HttpsError('failed-precondition', 'Guest record missing.')
      const guest = guestSnap.data() as GuestDoc
      if (guest.banned) {
        throw new HttpsError('permission-denied', 'This account can’t post messages.')
      }
      if (guest.castlePoints < cost) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${cost} castle point${cost === 1 ? '' : 's'} to send a message; you have ${guest.castlePoints}.`,
        )
      }

      const rateSnap = await tx.get(rateRef)
      const now = Date.now()
      const cur = (rateSnap.data() as RateDoc | undefined) ?? { minStart: now, minCount: 0 }
      const minFresh = now - cur.minStart >= MIN_WINDOW_MS
      const minCount = (minFresh ? 0 : cur.minCount) + 1
      if (minCount > PER_MIN_CAP) {
        throw new HttpsError('resource-exhausted', `Slow down — max ${PER_MIN_CAP}/min in this duel.`)
      }

      const scrub = scrubMessage(text)
      if (scrub.reject) {
        throw new HttpsError('invalid-argument', 'That message can’t be sent.')
      }
      const nextPoints = guest.castlePoints - cost

      const msgRef = db.collection(`wizard_rooms/${roomId}/messages`).doc()
      tx.set(msgRef, {
        uid,
        displayName: callerPre.displayName,
        isBypass: false,
        role: callerPre.role,
        color: callerPre.color,
        kind: 'text',
        cost,
        text: scrub.text,
        ts: now,
        serverTs: FieldValue.serverTimestamp(),
      })
      // Phase 1.1 — mirror into the Hall feed, atomically with the room
      // write. Same scrubbed text, tagged with the duel room so the bubble
      // can say where it came from and moderation can trace it back.
      const mirrorRef = db.collection('lobby/messages/items').doc()
      const mirror: ChatMessageDoc = {
        name: callerPre.displayName,
        uid,
        normalizedName: callerPre.normalizedName,
        isBypass: false,
        kind: 'user',
        text: scrub.text,
        ts: now,
        viaWizard: roomId,
        wizardMessageId: msgRef.id,
      }
      tx.set(mirrorRef, mirror)
      tx.set(rateRef, {
        minStart: minFresh ? now : cur.minStart,
        minCount,
      } satisfies RateDoc)
      tx.update(guestRef, { castlePoints: nextPoints })

      return {
        status: 'ok' as const,
        messageId: msgRef.id,
        censored: scrub.censored,
        castlePoints: nextPoints,
      }
    })
  },
)

// ── postWizardVoice ─────────────────────────────────────────────────────
//
// Push-to-talk voice messages. The client records with MediaRecorder
// (opus webm) for ≤ 15 s, base64-encodes the Blob, and sends it here.
// We store the bytes on the message doc itself so we don't have to
// wire up Firebase Storage; opus @ 32 kbps × 15 s ≈ 80 KB base64,
// well under Firestore's 1 MB doc cap.
//
// Cost is 5 castle points per clip — same atomicity guarantee as the
// text post (deduct + write or neither).

export const postWizardVoice = onCall<PostVoiceRequest, Promise<PostVoiceResponse>>(APP_CHECK,
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const roomId = String(req.data?.roomId ?? '')
    const audioBase64 = String(req.data?.audioBase64 ?? '')
    const mimeType = String(req.data?.mimeType ?? '')
    const durationMs = Number(req.data?.durationMs ?? 0)
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required.')
    if (!audioBase64) throw new HttpsError('invalid-argument', 'audioBase64 required.')
    if (audioBase64.length > MAX_VOICE_BYTES_BASE64) {
      throw new HttpsError('invalid-argument', 'Voice clip too large.')
    }
    const cleanMime = mimeType.split(';')[0]?.trim() ?? ''
    if (!ALLOWED_VOICE_MIMES.has(cleanMime)) {
      throw new HttpsError('invalid-argument', `Unsupported mimeType: ${mimeType}`)
    }
    if (!Number.isFinite(durationMs) || durationMs < MIN_VOICE_MS || durationMs > MAX_VOICE_MS) {
      throw new HttpsError('invalid-argument', `durationMs must be between ${MIN_VOICE_MS} and ${MAX_VOICE_MS}.`)
    }

    const db = getFirestore()
    const rateRef = db.doc(`wizard_rooms/${roomId}/rate_limits/${uid}`)
    const callerPre = await resolveCaller(uid, roomId)

    return db.runTransaction(async (tx) => {
      const cost = callerPre.role === 'player' ? VOICE_COST_PLAYER : VOICE_COST_SPECTATOR

      const guestRef = db.doc(`guests/${callerPre.normalizedName}`)
      const guestSnap = await tx.get(guestRef)
      if (!guestSnap.exists) throw new HttpsError('failed-precondition', 'Guest record missing.')
      const guest = guestSnap.data() as GuestDoc
      if (guest.banned) {
        throw new HttpsError('permission-denied', 'This account can’t post messages.')
      }
      if (guest.castlePoints < cost) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${cost} castle points to send a voice message; you have ${guest.castlePoints}.`,
        )
      }

      const rateSnap = await tx.get(rateRef)
      const now = Date.now()
      const cur = (rateSnap.data() as RateDoc | undefined) ?? { minStart: now, minCount: 0 }
      const minFresh = now - cur.minStart >= MIN_WINDOW_MS
      const minCount = (minFresh ? 0 : cur.minCount) + 1
      if (minCount > PER_MIN_CAP) {
        throw new HttpsError('resource-exhausted', `Slow down — max ${PER_MIN_CAP}/min in this duel.`)
      }

      const nextPoints = guest.castlePoints - cost

      const msgRef = db.collection(`wizard_rooms/${roomId}/messages`).doc()
      tx.set(msgRef, {
        uid,
        displayName: callerPre.displayName,
        isBypass: false,
        role: callerPre.role,
        color: callerPre.color,
        kind: 'voice',
        cost,
        audioBase64,
        mimeType: cleanMime,
        durationMs: Math.round(durationMs),
        ts: now,
        serverTs: FieldValue.serverTimestamp(),
      })
      // Phase 1.2 — metadata-only Hall mirror for voice (the audio bytes
      // stay on the room doc): visible, reportable, traceable to source.
      const mirrorRef = db.collection('lobby/messages/items').doc()
      const mirror: ChatMessageDoc = {
        name: callerPre.displayName,
        uid,
        normalizedName: callerPre.normalizedName,
        isBypass: false,
        kind: 'user',
        text: `🎙 sent a ${Math.max(1, Math.round(durationMs / 1000))}s voice message in a Wizard duel`,
        ts: now,
        viaWizard: roomId,
        wizardMessageId: msgRef.id,
        wizardVoice: true,
      }
      tx.set(mirrorRef, mirror)
      tx.set(rateRef, {
        minStart: minFresh ? now : cur.minStart,
        minCount,
      } satisfies RateDoc)
      tx.update(guestRef, { castlePoints: nextPoints })

      return {
        status: 'ok' as const,
        messageId: msgRef.id,
        castlePoints: nextPoints,
      }
    })
  },
)

// ── Caller resolution ───────────────────────────────────────────────────
//
// A caller is either one of the two seated players (cheap — look at the
// room doc) or a spectator (must be authed, must have an identity in
// chat_identity/{uid} set by the Hall's presence heartbeat). Bypass
// guests have no castlePoints balance so they can't pay; they're
// rejected here with a clear message.

async function resolveCaller(uid: string, roomId: string): Promise<CallerProfile> {
  const db = getFirestore()
  const roomRef = db.doc(`wizard_rooms/${roomId}`)
  const roomSnap = await roomRef.get()
  if (!roomSnap.exists) throw new HttpsError('not-found', 'Room not found.')
  const room = roomSnap.data() as WizardRoomLite

  // Seated player? Cheap path.
  const playerSlot =
    room.white.uid === uid ? { slot: room.white, color: 'w' as const } :
    room.black?.uid === uid ? { slot: room.black, color: 'b' as const } :
    null
  if (playerSlot) {
    if (playerSlot.slot.isBypass || !playerSlot.slot.normalizedName) {
      throw new HttpsError('permission-denied', 'Bypass guests cannot chat in duels (no castle points to spend).')
    }
    return {
      displayName: playerSlot.slot.displayName,
      normalizedName: playerSlot.slot.normalizedName,
      isBypass: false,
      role: 'player',
      color: playerSlot.color,
    }
  }

  // Spectator path: read the shadow identity doc that setPresence writes.
  const idSnap = await db.doc(`chat_identity/${uid}`).get()
  const idData = idSnap.data() as
    | { displayName: string; normalizedName: string; isBypass: boolean }
    | undefined
  if (!idData) {
    throw new HttpsError('failed-precondition', 'Set your presence (open the Hall first) before chatting.')
  }
  if (idData.isBypass || !idData.normalizedName) {
    throw new HttpsError('permission-denied', 'Bypass guests cannot chat in duels (no castle points to spend).')
  }
  return {
    displayName: idData.displayName,
    normalizedName: idData.normalizedName,
    isBypass: false,
    role: 'spectator',
    color: null,
  }
}
