// Hook that subscribes to currently-open chess and wizard rooms — the
// ones in `waiting` status that need a second player. Drives the
// "2 waiting" badge on the Hall's Online Chess + Wizard's Duel doors,
// and the chooser dialog that opens on click.
//
// Each subscription is capped at 25 rooms so we don't accidentally
// fetch a long tail of stale waiting docs. The cleanup function
// (cleanupStaleRooms) sweeps anything older than its TTL anyway.

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/app'

export interface WaitingRoom {
  roomId: string
  kind: 'chess' | 'wizard'
  openerDisplayName: string
  openerNormalizedName?: string
  createdAt: number
  /** Chess only — wizard duels run a fixed 8-min clock. */
  timeControl?: { initialMs: number; incrementMs: number } | null
}

/** Hard cap so a misbehaving listener can't surface dozens of stale
 *  docs to the Hall. The room-cleanup sweep handles old `waiting`
 *  rooms server-side; this is just belt-and-suspenders. */
const MAX_ROOMS_PER_KIND = 25

export interface WaitingRoomsState {
  chess: WaitingRoom[]
  wizard: WaitingRoom[]
}

export function useWaitingRooms(): WaitingRoomsState {
  const [chess, setChess] = useState<WaitingRoom[]>([])
  const [wizard, setWizard] = useState<WaitingRoom[]>([])

  useEffect(() => {
    const chessQ = query(
      collection(db, 'rooms'),
      where('status', '==', 'waiting'),
      limit(MAX_ROOMS_PER_KIND),
    )
    const unsub = onSnapshot(
      chessQ,
      (snap) => {
        const rows: WaitingRoom[] = []
        snap.forEach((doc) => {
          const d = doc.data() as {
            white?: { displayName?: string; normalizedName?: string }
            createdAt?: number
            timeControl?: { initialMs: number; incrementMs: number } | null
          }
          rows.push({
            roomId: doc.id,
            kind: 'chess',
            openerDisplayName: d.white?.displayName ?? 'Someone',
            openerNormalizedName: d.white?.normalizedName,
            createdAt: d.createdAt ?? 0,
            timeControl: d.timeControl ?? null,
          })
        })
        // Newest first — most kid-facing room is "who just opened
        // something I could grab right now".
        rows.sort((a, b) => b.createdAt - a.createdAt)
        setChess(rows)
      },
      (err) => console.warn('[waiting-rooms] chess subscription error', err),
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const wizardQ = query(
      collection(db, 'wizard_rooms'),
      where('status', '==', 'waiting'),
      limit(MAX_ROOMS_PER_KIND),
    )
    const unsub = onSnapshot(
      wizardQ,
      (snap) => {
        const rows: WaitingRoom[] = []
        snap.forEach((doc) => {
          const d = doc.data() as {
            white?: { displayName?: string; normalizedName?: string }
            createdAt?: number
          }
          rows.push({
            roomId: doc.id,
            kind: 'wizard',
            openerDisplayName: d.white?.displayName ?? 'Someone',
            openerNormalizedName: d.white?.normalizedName,
            createdAt: d.createdAt ?? 0,
          })
        })
        rows.sort((a, b) => b.createdAt - a.createdAt)
        setWizard(rows)
      },
      (err) => console.warn('[waiting-rooms] wizard subscription error', err),
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
