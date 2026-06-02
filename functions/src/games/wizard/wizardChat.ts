// Per-duel chat. Lives separately from the Hall (lobby/messages) so a
// duel's chat doesn't pollute the public scroll and only the two players
// in the duel can read / post.
//
// Storage: wizard_rooms/{roomId}/messages/{messageId}
// Cost:    1 castle point per text message (deducted atomically). Voice
//          messages (planned for W.4.3) will cost 5 points each.
// Limits:  6 messages / minute / room — keeps bursty spam from being too
//          loud even when the caster has plenty of points.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { scrubMessage } from '../../castle/profanity'
import type { GuestDoc } from '../../castle/types'

const MAX_CHARS = 240
const PER_MIN_CAP = 6
const MIN_WINDOW_MS = 60 * 1000
const TEXT_COST = 1

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

export const postWizardMessage = onCall<PostRequest, Promise<PostResponse>>(
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
    const roomRef = db.doc(`wizard_rooms/${roomId}`)
    const rateRef = db.doc(`wizard_rooms/${roomId}/rate_limits/${uid}`)

    // Everything that touches castle points must be transactional with the
    // message write so we never charge without posting (or vice versa).
    return db.runTransaction(async (tx) => {
      const roomSnap = await tx.get(roomRef)
      if (!roomSnap.exists) throw new HttpsError('not-found', 'Room not found.')
      const room = roomSnap.data() as WizardRoomLite

      const callerSlot =
        room.white.uid === uid ? room.white :
        room.black?.uid === uid ? room.black :
        null
      if (!callerSlot) throw new HttpsError('permission-denied', 'Only players in this duel can chat here.')
      if (callerSlot.isBypass || !callerSlot.normalizedName) {
        throw new HttpsError('permission-denied', 'Bypass guests cannot chat in duels (no castle points to spend).')
      }

      const guestRef = db.doc(`guests/${callerSlot.normalizedName}`)
      const guestSnap = await tx.get(guestRef)
      if (!guestSnap.exists) throw new HttpsError('failed-precondition', 'Guest record missing.')
      const guest = guestSnap.data() as GuestDoc
      if (guest.castlePoints < TEXT_COST) {
        throw new HttpsError(
          'failed-precondition',
          `Need ${TEXT_COST} castle point to send a message; you have ${guest.castlePoints}.`,
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
      const color: 'w' | 'b' = room.white.uid === uid ? 'w' : 'b'
      const nextPoints = guest.castlePoints - TEXT_COST

      const msgRef = db.collection(`wizard_rooms/${roomId}/messages`).doc()
      tx.set(msgRef, {
        uid,
        displayName: callerSlot.displayName,
        isBypass: false,
        color,
        kind: 'text',
        cost: TEXT_COST,
        text: scrub.text,
        ts: now,
        serverTs: FieldValue.serverTimestamp(),
      })
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
