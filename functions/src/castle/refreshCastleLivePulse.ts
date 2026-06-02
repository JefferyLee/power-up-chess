// Scheduled aggregator for the Castle gate's "live pulse" — the
// town-crier ticker that tells visitors what's happening inside RIGHT
// NOW. Rebuilds a single doc (castle_live/pulse) every 2 minutes that
// the gate page subscribes to.
//
// Pulled together so the gate doesn't have to fan out across multiple
// collections on every visitor pageload (which would also require
// public-read rules on lobby/messages — not desired).

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { ChatMessageDoc } from './chatTypes'

const HOUR_MS = 60 * 60 * 1000
const MAX_DUELS = 3

export interface CastleLivePulse {
  /** Wizard duels currently live (room.status === 'live'). */
  duelsInProgress: number
  /** Up to MAX_DUELS most recent duel-end system messages from the
   *  past hour. Text is pre-rendered (e.g. "🏆 Ada checkmated Tom…"). */
  recentDuels: Array<{ text: string; ts: number }>
  /** The most recent host ambient-story message from the past hour,
   *  trimmed to a single-sentence snippet. Absent if none. */
  lastStory?: {
    hostId: 'lucy' | 'luca'
    snippet: string
    ts: number
  }
  refreshedAt: number
}

export const refreshCastleLivePulse = onSchedule(
  { schedule: 'every 2 minutes', timeoutSeconds: 60 },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const hourAgo = now - HOUR_MS

    // Recent lobby messages, last hour — fetch once and partition.
    const recentMsgs = await db
      .collection('lobby/messages/items')
      .where('ts', '>=', hourAgo)
      .orderBy('ts', 'desc')
      .limit(80)
      .get()

    const recentDuels: CastleLivePulse['recentDuels'] = []
    let lastStory: CastleLivePulse['lastStory'] | undefined
    for (const doc of recentMsgs.docs) {
      const m = doc.data() as ChatMessageDoc
      if (
        recentDuels.length < MAX_DUELS &&
        m.kind === 'system' &&
        m.action?.kind === 'join-room' &&
        m.action.roomKind === 'wizard' &&
        m.text.includes('Duel')
      ) {
        // Only count completed-duel announcements (they start with a
        // trophy or end with an em-dash + duel info). Open-room
        // invites use "just opened a Wizard's Duel".
        if (!m.text.includes('just opened')) {
          recentDuels.push({ text: m.text, ts: m.ts })
        }
      }
      if (!lastStory && m.kind === 'host' && (m.hostId === 'lucy' || m.hostId === 'luca')) {
        lastStory = {
          hostId: m.hostId,
          snippet: snippetForTicker(m.text),
          ts: m.ts,
        }
      }
      if (recentDuels.length >= MAX_DUELS && lastStory) break
    }

    // Duels currently live.
    const liveDuelsSnap = await db
      .collection('wizard_rooms')
      .where('status', '==', 'live')
      .get()
    const duelsInProgress = liveDuelsSnap.size

    const pulse: CastleLivePulse = {
      duelsInProgress,
      recentDuels,
      ...(lastStory ? { lastStory } : {}),
      refreshedAt: now,
    }

    await db.doc('castle_live/pulse').set({
      ...pulse,
      // Server timestamp alongside the wall-clock for any future debugging.
      serverTs: FieldValue.serverTimestamp(),
    })
    console.log(
      `refreshCastleLivePulse: duels=${duelsInProgress} ` +
      `recent=${recentDuels.length} story=${lastStory ? 'yes' : 'no'}`,
    )
  },
)

/** Trim a host-story body to a single-sentence ticker snippet. The
 *  ambient-story text is often 2-5 sentences; we want the first one. */
function snippetForTicker(text: string): string {
  const trimmed = text.trim()
  // Find the first sentence boundary, but only if it's not too short.
  const match = trimmed.match(/^(.{30,180}?[.!?])(\s|$)/)
  if (match && match[1]) return match[1]
  // Fall back to ~140 chars + ellipsis.
  return trimmed.length > 140 ? trimmed.slice(0, 138).trimEnd() + '…' : trimmed
}
