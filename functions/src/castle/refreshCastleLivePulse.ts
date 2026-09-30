// Scheduled aggregator for the Castle gate's "town crier" pulse —
// rebuilds castle_live/pulse every 2 minutes. The gate page subscribes
// and rotates through the entries to show visitors what's happening
// inside before they sign in.
//
// Pool of signals (each lives on the same doc, client picks rotation):
//   - duelsInProgress (count of live wizard rooms)
//   - visitorsToday   (24-hour unique-guest count)
//   - inHallNow       (display names of people in the Hall right now)
//   - topSolversToday (top 3 by puzzleSolvesToday — names + counts)
//   - recentDuels     (last 3 completed duels, last hour)
//   - lastStory       (most recent host story, snippet + full body)
//
// Aggregating server-side means the gate doesn't fan-out across
// collections per visitor, and we don't need public read rules on
// lobby/messages (which carries chat).

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { ChatMessageDoc, PresenceDoc } from './chatTypes'
import type { GuestDoc } from './types'
import { laDayKey } from '../puzzles/dailyFive'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const PRESENCE_FRESH_MS = 90 * 1000  // count as "in Hall now" if seen ≤ 90s ago
const MAX_DUELS = 3
const MAX_PRESENCE = 3
const MAX_SOLVERS = 3

export interface PulseSolver {
  displayName: string
  count: number
}
export interface PulsePresence {
  displayName: string
}
export interface CastleLivePulse {
  /** Wizard duels currently live (room.status === 'live'). */
  duelsInProgress: number
  /** Unique non-bypass guests seen in the last 24 h. */
  visitorsToday: number
  /** Up to 3 non-bypass guests currently in the Hall (presence
   *  heartbeat in the last 90 s, location is hall or unset). */
  inHallNow: PulsePresence[]
  /** Up to 3 top puzzle solvers today (LA-day). Non-bypass only. */
  topSolversToday: PulseSolver[]
  /** Up to MAX_DUELS most recent duel-end system messages from the
   *  past hour. Text is pre-rendered. */
  recentDuels: Array<{ text: string; ts: number }>
  /** The most recent host ambient-story message from the past hour
   *  with full body for the gate's expand overlay. */
  lastStory?: {
    hostId: 'lucy' | 'luca'
    snippet: string
    /** Full story body, untruncated. Powers the gate's expand overlay. */
    body: string
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
    const dayAgo = now - DAY_MS
    const todayKey = laDayKey(now)
    const presenceCutoff = now - PRESENCE_FRESH_MS

    // ── Recent lobby messages (duels + last story) ────────────────────
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
        if (!m.text.includes('just opened')) {
          recentDuels.push({ text: m.text, ts: m.ts })
        }
      }
      if (!lastStory && m.kind === 'host' && (m.hostId === 'lucy' || m.hostId === 'luca')) {
        lastStory = {
          hostId: m.hostId,
          snippet: snippetForTicker(m.text),
          body: m.text,
          ts: m.ts,
        }
      }
      if (recentDuels.length >= MAX_DUELS && lastStory) break
    }

    // ── Duels currently live ──────────────────────────────────────────
    const liveDuelsSnap = await db
      .collection('wizard_rooms')
      .where('status', '==', 'live')
      .get()
    const duelsInProgress = liveDuelsSnap.size

    // ── Today's top puzzle solvers (LA day) ───────────────────────────
    // Guest docs only exist for non-bypass identities, so no extra
    // bypass filter needed here. This doc is readable without sign-in,
    // so the Phase 3.7 opt-out keeps a guest's name out of both the
    // solvers list and the in-Hall list (they still count as a visitor).
    const guestsSnap = await db.collection('guests').get()
    const todaysSolvers: PulseSolver[] = []
    const hiddenNames = new Set<string>()
    let visitorsToday = 0
    for (const d of guestsSnap.docs) {
      const g = d.data() as GuestDoc
      if (typeof g.lastVisitAt === 'number' && g.lastVisitAt >= dayAgo) {
        visitorsToday++
      }
      if (g.hideFromLeaderboards) {
        hiddenNames.add(d.id)
        continue
      }
      const ps = g.puzzleSolvesToday
      if (ps && ps.dayKey === todayKey && ps.count > 0) {
        todaysSolvers.push({ displayName: g.displayName, count: ps.count })
      }
    }
    todaysSolvers.sort(
      (a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName),
    )
    const topSolversToday = todaysSolvers.slice(0, MAX_SOLVERS)

    // ── In-Hall right now (presence) ──────────────────────────────────
    const presenceSnap = await db
      .collection('lobby/presence/items')
      .where('lastSeenAt', '>=', presenceCutoff)
      .get()
    const inHallSet = new Map<string, PulsePresence>()
    for (const d of presenceSnap.docs) {
      const p = d.data() as PresenceDoc
      if (p.isBypass) continue
      if (p.normalizedName && hiddenNames.has(p.normalizedName)) continue
      // 'hall' (explicit) or undefined (defaulted to hall) — exclude
      // rooms so the pulse really says "in the Hall".
      const loc = p.location?.kind
      if (loc && loc !== 'hall') continue
      const key = p.normalizedName || p.displayName
      if (!inHallSet.has(key)) {
        inHallSet.set(key, { displayName: p.displayName })
      }
      if (inHallSet.size >= MAX_PRESENCE) break
    }
    const inHallNow = Array.from(inHallSet.values())

    const pulse: CastleLivePulse = {
      duelsInProgress,
      visitorsToday,
      inHallNow,
      topSolversToday,
      recentDuels,
      ...(lastStory ? { lastStory } : {}),
      refreshedAt: now,
    }

    await db.doc('castle_live/pulse').set({
      ...pulse,
      serverTs: FieldValue.serverTimestamp(),
    })
    console.log(
      `refreshCastleLivePulse: duels=${duelsInProgress} visitors=${visitorsToday} ` +
      `hall=${inHallNow.length} solvers=${topSolversToday.length} ` +
      `recent=${recentDuels.length} story=${lastStory ? 'yes' : 'no'}`,
    )
  },
)

function snippetForTicker(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(/^(.{30,180}?[.!?])(\s|$)/)
  if (match && match[1]) return match[1]
  return trimmed.length > 140 ? trimmed.slice(0, 138).trimEnd() + '…' : trimmed
}
