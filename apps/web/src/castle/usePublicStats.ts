// usePublicStats — realtime subscription to castle_public/stats.
// Used by the Gate page to render guest count + top-5 leaderboard
// without requiring sign-in.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'

export interface PublicStats {
  activeToday: number
  topGuests: Array<{ displayName: string; castlePoints: number }>
  refreshedAt: number
}

export type PublicStatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: PublicStats }
  | { status: 'empty' }

export function usePublicStats(): PublicStatsState {
  const [state, setState] = useState<PublicStatsState>({ status: 'loading' })

  useEffect(() => {
    const ref = doc(db, 'castle_public', 'stats')
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({ status: 'empty' })
          return
        }
        const data = snap.data() as PublicStats | undefined
        if (!data) {
          setState({ status: 'empty' })
          return
        }
        setState({ status: 'ready', stats: data })
      },
      () => {
        // Permission or network error — show empty rather than error.
        setState({ status: 'empty' })
      },
    )
    return unsub
  }, [])

  return state
}
