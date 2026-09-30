// Hook that subscribes to the sanitised castle_public/waitingRooms feed
// — rebuilt every minute by the heraldWaitingRooms job from the chess
// and wizard rooms in `waiting` status. Drives the "2 waiting" badge on
// the Hall's Online Chess + Wizard's Duel doors, and the chooser dialog
// that opens on click.
//
// Clients can't LIST rooms / wizard_rooms directly (those docs carry
// uids); the feed holds only what the Hall shows — host display name,
// clock, age — capped at 25 per kind server-side.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { normalizeName } from './identity'

export interface WaitingRoom {
  roomId: string
  kind: 'chess' | 'wizard'
  openerDisplayName: string
  openerNormalizedName?: string
  createdAt: number
  /** Chess only — wizard duels run a fixed 8-min clock. */
  timeControl?: { initialMs: number; incrementMs: number } | null
}

/** One row of the feed — mirrors functions/src/lobby/waitingRoomsFeed.ts. */
interface FeedRow {
  roomId: string
  hostDisplayName: string
  hostIsBypass?: boolean
  createdAt?: number
  timeControl?: { initialMs: number; incrementMs: number } | null
}
interface FeedDoc {
  rooms?: FeedRow[]
  wizardRooms?: FeedRow[]
  refreshedAt?: number
}

function toWaitingRoom(kind: 'chess' | 'wizard', r: FeedRow): WaitingRoom {
  const room: WaitingRoom = {
    roomId: r.roomId,
    kind,
    openerDisplayName: r.hostDisplayName || 'Someone',
    createdAt: r.createdAt ?? 0,
  }
  // The feed carries display names only. A normalized name is just
  // trim + lowercase on both sides (identity.normalizeName mirrors the
  // server's castleEnter.normalize), so derive it here for the chooser's
  // self-filter + profile link. Bypass hosts have no profile to link to.
  if (!r.hostIsBypass) room.openerNormalizedName = normalizeName(r.hostDisplayName)
  if (kind === 'chess') room.timeControl = r.timeControl ?? null
  return room
}

export interface WaitingRoomsState {
  chess: WaitingRoom[]
  wizard: WaitingRoom[]
}

export function useWaitingRooms(): WaitingRoomsState {
  const [chess, setChess] = useState<WaitingRoom[]>([])
  const [wizard, setWizard] = useState<WaitingRoom[]>([])

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'castle_public', 'waitingRooms'),
      (snap) => {
        const d = (snap.data() as FeedDoc | undefined) ?? {}
        setChess((d.rooms ?? []).map((r) => toWaitingRoom('chess', r)))
        setWizard((d.wizardRooms ?? []).map((r) => toWaitingRoom('wizard', r)))
      },
      (err) => console.warn('[waiting-rooms] feed subscription error', err),
    )
    return () => unsub()
  }, [])

  return { chess, wizard }
}

/** Display the count compactly: 0 ⇒ no badge, 1-99 as-is, 100+ ⇒ "99+". */
export function formatRoomCount(n: number): string {
  if (n <= 99) return String(n)
  return '99+'
}
