// Subscribe to the castle gate's live-pulse doc, rebuilt server-side
// every 2 min by refreshCastleLivePulse. PUBLIC read — works on the
// gate page before sign-in.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'

export interface CastleLivePulse {
  duelsInProgress: number
  recentDuels: Array<{ text: string; ts: number }>
  lastStory?: {
    hostId: 'lucy' | 'luca'
    snippet: string
    ts: number
  }
  refreshedAt: number
}

export type CastleLivePulseState =
  | { status: 'loading' }
  | { status: 'ready'; pulse: CastleLivePulse }
  | { status: 'empty' }

export function useCastleLivePulse(): CastleLivePulseState {
  const [state, setState] = useState<CastleLivePulseState>({ status: 'loading' })
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'castle_live', 'pulse'),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: 'empty' })
          return
        }
        setState({ status: 'ready', pulse: snap.data() as CastleLivePulse })
      },
      (err) => {
        console.warn('useCastleLivePulse:', err)
        setState({ status: 'empty' })
      },
    )
    return unsub
  }, [])
  return state
}
