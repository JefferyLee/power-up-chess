// Realtime subscription to a wizard_rooms/{roomId} doc.
// Mirrors the chess useRoom pattern. The room doc is the source of truth;
// the client mirrors it through onSnapshot, never holds local engine state.

import { doc, onSnapshot } from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../firebase/app'
import type { Color } from '../../chess/types'
import type { SpellId, WizardActionRecord } from './types'

export interface WizardPlayerSlot {
  uid: string
  displayName: string
  normalizedName: string
  isBypass: boolean
}

export interface WizardTimeControl {
  initialMs: number
  incrementMs: number
}

export interface WizardRoomDoc {
  white: WizardPlayerSlot
  black: WizardPlayerSlot | null
  status: 'waiting' | 'live' | 'completed'
  fen: string
  currentTurn: Color
  plyCount: number
  effects: Array<{
    square: string
    kind: 'freeze' | 'confuse' | 'shield' | 'phantom'
    affectedColor: Color
    caster: Color
    expiresAtPly: number
  }>
  actions: WizardActionRecord[]
  winner: Color | null
  endReason: 'checkmate' | 'timeout' | 'resign' | null
  /** Fischer time control — present on all rooms created since W.4.7. */
  timeControl?: WizardTimeControl
  whiteTimeMs?: number
  blackTimeMs?: number
  /** Server-ms when the side-to-move's clock started ticking. null while
   *  waiting / after the game ends. */
  lastTickServerTs?: number | null
  createdAt: number
  updatedAt: number
}

export type WizardRoomState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ready'; room: WizardRoomDoc }
  | { status: 'error'; error: Error }

export interface UseWizardRoomResult {
  state: WizardRoomState
  retry: () => void
}

export function useWizardRoom(roomId: string | null): UseWizardRoomResult {
  const [state, setState] = useState<WizardRoomState>({ status: 'loading' })
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    if (!roomId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' })
    const unsub = onSnapshot(
      doc(db, 'wizard_rooms', roomId),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: 'not_found' })
          return
        }
        setState({ status: 'ready', room: snap.data() as WizardRoomDoc })
      },
      (err) => {
        const code = (err as { code?: string }).code
        if (code === 'permission-denied') setState({ status: 'forbidden' })
        else setState({ status: 'error', error: err })
      },
    )
    return unsub
  }, [roomId, retryTick])

  const retry = useCallback(() => setRetryTick((n) => n + 1), [])
  return { state, retry }
}

// Re-export the spell id for convenience.
export type { SpellId }
