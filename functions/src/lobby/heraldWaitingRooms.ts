// heraldWaitingRooms — every minute: (1) republish the sanitised
// castle_public/waitingRooms feed that drives the Hall door badges +
// chooser (clients can't list rooms / wizard_rooms — those docs carry
// uids), and (2) post a Hall chat hint when a chess or wizard room has
// been sitting in `waiting` status with no joiner for longer than
// HERALD_AFTER_MS — the safety net for kids who are watching chat
// rather than the doors.
//
// Per-opener throttle: at most ONE herald per opener per run. With a
// 1-minute schedule + the 30s threshold, a kid who opens five rooms
// in a row will see at most one herald appear in chat now, the next
// in ~60s if the first is still unjoined, and so on. The room doc's
// `heraldedAt` field is what gates the second posting — once stamped,
// future runs skip the room until the cleanup sweep removes it.

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { ChatMessageDoc } from '../castle/chatTypes'
import {
  buildFeedRows,
  WAITING_ROOMS_FEED_PATH,
  type RawWaitingRoom,
  type WaitingRoomsFeedDoc,
} from './waitingRoomsFeed'

/** A waiting room must be at least this old before we herald it. */
const HERALD_AFTER_MS = 30 * 1000
/** Hard cap so a runaway batch can't dump dozens of messages. */
const MAX_HERALDS_PER_RUN = 20

interface MinimalRoom {
  id: string
  kind: 'chess' | 'wizard'
  openerName: string
  openerNormalizedName: string
  createdAt: number
}

export const heraldWaitingRooms = onSchedule(
  { schedule: 'every 1 minutes', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const cutoff = now - HERALD_AFTER_MS

    const candidates: MinimalRoom[] = []
    const feed: WaitingRoomsFeedDoc = { rooms: [], wizardRooms: [], refreshedAt: now }
    for (const [kind, colName] of [
      ['chess', 'rooms'],
      ['wizard', 'wizard_rooms'],
    ] as const) {
      const snap = await db
        .collection(colName)
        .where('status', '==', 'waiting')
        .get()
      const raw: RawWaitingRoom[] = []
      for (const doc of snap.docs) {
        const d = doc.data() as Omit<RawWaitingRoom, 'id'> & { heraldedAt?: number }
        raw.push({ id: doc.id, white: d.white, createdAt: d.createdAt, timeControl: d.timeControl })
        if (typeof d.heraldedAt === 'number') continue
        if (typeof d.createdAt !== 'number' || d.createdAt > cutoff) continue
        const openerNormalizedName = d.white?.normalizedName ?? ''
        if (!openerNormalizedName) continue
        candidates.push({
          id: doc.id,
          kind,
          openerName: d.white?.displayName ?? 'Someone',
          openerNormalizedName,
          createdAt: d.createdAt,
        })
      }
      feed[kind === 'chess' ? 'rooms' : 'wizardRooms'] = buildFeedRows(raw, kind)
    }

    // Always rewrite the feed (even when empty) so a room that was
    // joined or swept disappears from the Hall within a minute.
    try {
      await db.doc(WAITING_ROOMS_FEED_PATH).set(feed)
    } catch (err) {
      console.warn('heraldWaitingRooms: feed publish failed', err)
    }

    if (candidates.length === 0) {
      console.log('heraldWaitingRooms: nothing to herald')
      return
    }

    // Per-opener throttle: oldest first, then dedup so any one opener
    // surfaces at most once this run. Subsequent rooms by the same
    // opener pick up on the next scheduled run if still waiting.
    candidates.sort((a, b) => a.createdAt - b.createdAt)
    const seenOpener = new Set<string>()
    const heralds: MinimalRoom[] = []
    for (const c of candidates) {
      if (seenOpener.has(c.openerNormalizedName)) continue
      seenOpener.add(c.openerNormalizedName)
      heralds.push(c)
      if (heralds.length >= MAX_HERALDS_PER_RUN) break
    }

    for (const room of heralds) {
      const text = room.kind === 'wizard'
        ? `🪄 ${room.openerName} is waiting for a Wizard's Duel challenger — anyone in?`
        : `♟ ${room.openerName} is looking for a chess opponent — anyone want to play?`
      const msg: ChatMessageDoc = {
        name: 'Castle herald',
        uid: '',
        normalizedName: '',
        isBypass: false,
        kind: 'system',
        text,
        ts: Date.now(),
        action: {
          kind: 'join-open-room',
          roomKind: room.kind,
          roomId: room.id,
          openerName: room.openerName,
        },
      }
      try {
        await db.collection('lobby/messages/items').add(msg)
        const colName = room.kind === 'wizard' ? 'wizard_rooms' : 'rooms'
        await db.doc(`${colName}/${room.id}`).update({ heraldedAt: Date.now() })
      } catch (err) {
        // Don't bail on the whole run if one herald fails — log and
        // move on; next minute we'll try again.
        console.warn(`heraldWaitingRooms[${room.id}]: failed`, err)
      }
    }
    console.log(`heraldWaitingRooms: posted ${heralds.length} herald(s)`)
  },
)
