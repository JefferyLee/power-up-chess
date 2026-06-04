// useRoom: subscribes to a Firestore room doc and exposes a submitMove action.
//
// Loading state shows "joining"; ready state exposes the room snapshot;
// error state captures Firestore listener failures (most commonly: room not
// found, or the caller is not yet a participant per security rules).

import { doc, onSnapshot } from 'firebase/firestore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../firebase/app'
import { callSubmitMove } from '../firebase/callables'
import type { RoomDoc } from './types'

export type RoomState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'ready'; room: RoomDoc }
  | { status: 'error'; error: Error }

export interface UseRoomResult {
  state: RoomState
  submitMove: (uci: string) => Promise<void>
  /** Re-subscribe to the room. Used after Join succeeds, since Firestore
   *  tears down a listener that hits permission-denied. */
  retry: () => void
}

export function useRoom(roomId: string | null): UseRoomResult {
  const [state, setState] = useState<RoomState>({ status: 'loading' })
  const [retryTick, setRetryTick] = useState(0)
  // Ref mirror of state so submitMove always reads the LATEST moves
  // length, not whatever the closure captured at memo time. Combined
  // with the in-flight lock below this kills the "Move index out of
  // sync" race: a tick that lands between submit dispatch and call
  // execution still gets the up-to-date ply count.
  const stateRef = useRef(state)
  const inFlightRef = useRef(false)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!roomId) return
    // Reset to loading whenever the room id (or retry tick) changes; the
    // snapshot listener will replace this with ready / not_found / forbidden
    // once it fires.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: 'loading' })
    const unsub = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: 'not_found' })
          return
        }
        setState({ status: 'ready', room: snap.data() as RoomDoc })
      },
      (err) => {
        // Permission-denied from rules means the caller is not (yet) listed
        // on the room. The Join flow handles becoming listed; once it has,
        // the caller invokes retry() to re-subscribe.
        const code = (err as { code?: string }).code
        if (code === 'permission-denied') {
          setState({ status: 'forbidden' })
        } else {
          setState({ status: 'error', error: err })
        }
      },
    )
    return unsub
  }, [roomId, retryTick])

  const retry = useCallback(() => setRetryTick((n) => n + 1), [])

  const submitMove = useCallback(async (uci: string) => {
    const current = stateRef.current
    if (current.status !== 'ready' || !roomId) {
      throw new Error('Room is not ready.')
    }
    // Single-flight: a touch-event double-fire or a fast re-click
    // would otherwise send the same moveIndex twice. The second send
    // is silently dropped — the snapshot will reflect the first one.
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await callSubmitMove({
        roomId,
        moveIndex: current.room.moves.length,
        uci,
        clientTs: Date.now(),
      })
    } finally {
      inFlightRef.current = false
    }
  }, [roomId])

  return { state, submitMove, retry }
}
