// Realtime subscriptions for the Hall: messages + presence.

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/app'

export type ChatMessageAction =
  | { kind: 'join-room'; roomKind: 'chess' | 'wizard'; roomId: string; openerName: string }

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
}

export type LocationTag =
  | { kind: 'hall' }
  | { kind: 'chess'; roomId: string }
  | { kind: 'wizard'; roomId: string }

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
}

export interface RoomOccupancy {
  kind: 'chess' | 'wizard'
  roomId: string
  occupants: PresenceRow[]
}

export interface PresenceGroups {
  hall: PresenceRow[]
  rooms: RoomOccupancy[]
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

/** Split presence rows into "in the Hall" + per-room sections. Rooms
 *  with no occupants are omitted (they fall off naturally since their
 *  rows have already TTL-expired). */
export function groupPresence(rows: readonly PresenceRow[]): PresenceGroups {
  const hall: PresenceRow[] = []
  const byRoom = new Map<string, RoomOccupancy>()
  for (const row of rows) {
    const loc = row.location
    if (!loc || loc.kind === 'hall') {
      hall.push(row)
      continue
    }
    const key = `${loc.kind}:${loc.roomId}`
    let bucket = byRoom.get(key)
    if (!bucket) {
      bucket = { kind: loc.kind, roomId: loc.roomId, occupants: [] }
      byRoom.set(key, bucket)
    }
    bucket.occupants.push(row)
  }
  return { hall, rooms: Array.from(byRoom.values()) }
}
