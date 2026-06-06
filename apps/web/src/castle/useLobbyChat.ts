// Realtime subscriptions for the Hall: messages + presence.

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/app'
import type { TeamBadge } from '../firebase/callables'

export type ChatMessageAction =
  | { kind: 'join-room'; roomKind: 'chess' | 'wizard'; roomId: string; openerName: string }
  | {
      kind: 'team-recruit'
      teamId: string
      teamName: string
      captainDisplayName: string
      memberCount: number
      badge?: TeamBadge
    }

export interface QuizState {
  question: string
  state: 'open' | 'won' | 'closed'
  winnerName?: string
  winnerUid?: string
  earnedPoint?: boolean
  explanation?: string
  resolvedAt?: number
}

export interface ChatMessage {
  id: string
  name: string
  uid: string
  normalizedName: string
  isBypass: boolean
  kind: 'user' | 'host' | 'system'
  text: string
  ts: number
  hidden?: boolean
  hostId?: 'lucy' | 'luca'
  action?: ChatMessageAction
  quiz?: QuizState
  /** Set on the server snapshot if the author had a cosmetic effect
   *  active at send time (currently only the post-duel-win halo). */
  hasHalo?: boolean
  /** Streak crown — 3+ consecutive Wizard's Duel wins. Overrides halo. */
  hasCrown?: boolean
  /** P2.H — Weekly Tournament champion crown. Highest priority. */
  hasTournamentCrown?: boolean
  /** Lifetime-earn title at send time (Apprentice/Adept/Sorcerer/Archmage). */
  title?: string
  /** True when this message was sent via the Castle Terminal's /say
   *  bridge — the bubble renders a "secret tunnel" tag. */
  viaTerminal?: boolean
}

export type LocationTag =
  | { kind: 'hall' }
  | { kind: 'chess'; roomId: string }
  | { kind: 'wizard'; roomId: string }
  | { kind: 'puzzle-garden' }
  | { kind: 'puzzle-plot'; plot: string }
  | { kind: 'puzzle-daily' }
  | { kind: 'puzzle-legends' }
  | { kind: 'puzzle-calibration' }
  | { kind: 'puzzle-leaderboard' }
  | { kind: 'practice' }
  | { kind: 'local' }
  | { kind: 'forest' }

export interface PresenceRow {
  sessionId: string
  displayName: string
  normalizedName: string
  uid: string
  isBypass: boolean
  hostId: 'lucy' | 'luca'
  lastSeenAt: number
  /** Where the user is right now — undefined ≈ hall (legacy rows). */
  location?: LocationTag
  /** True if this guest currently has the post-duel-win halo cosmetic. */
  hasHalo?: boolean
  /** True if this guest currently has the 3-win streak crown. Overrides halo. */
  hasCrown?: boolean
  /** P2.H — true while the Weekly Tournament champion crown is active.
   *  Highest priority of the three. */
  hasTournamentCrown?: boolean
  /** Live lifetime-earn title label. */
  title?: string
  /** Today's Five HP — five-slot results for the current LA day.
   *  true=solved, false=failed, null=pending. Absent when the guest
   *  hasn't started today's set. Refreshed every heartbeat (~20s). */
  todaysFive?: Array<boolean | null>
  /** ISO 2-char country code from the guest's most recent castleEnter. */
  country?: string
}

const MAX_VISIBLE = 80

export function useLobbyMessages(): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  useEffect(() => {
    const q = query(
      collection(db, 'lobby/messages/items'),
      orderBy('ts', 'desc'),
      limit(MAX_VISIBLE),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))
          .filter((m) => !m.hidden)
          .reverse()
        setMessages(rows)
      },
      (err) => {
        console.warn('useLobbyMessages:', err)
      },
    )
    return unsub
  }, [])
  return messages
}

export function useLobbyPresence(): PresenceRow[] {
  const [rows, setRows] = useState<PresenceRow[]>([])
  useEffect(() => {
    const q = query(collection(db, 'lobby/presence/items'), orderBy('lastSeenAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now()
        const TTL = 60_000
        const all = snap.docs
          .map((d) => d.data() as PresenceRow)
          .filter((p) => now - p.lastSeenAt < TTL)
        // Dedup by normalizedName (one row per guest, even if multiple devices).
        // Bypass guests keep their per-session rows since they have no shared name.
        const seen = new Set<string>()
        const deduped: PresenceRow[] = []
        for (const p of all) {
          const key = p.isBypass ? `b:${p.sessionId}` : `g:${p.normalizedName}`
          if (seen.has(key)) continue
          seen.add(key)
          deduped.push(p)
        }
        setRows(deduped)
      },
      (err) => {
        console.warn('useLobbyPresence:', err)
      },
    )
    return unsub
  }, [])
  return rows
}

