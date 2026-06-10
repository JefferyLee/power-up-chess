// useCurrentChampion — subscribes to castle_live/current_champion, the
// singleton snapshot of the most recently crowned weekly winner.
// Returns null when there's no live champion (no tournament closed
// yet, or the 7-day reign has expired client-side without the doc
// being cleared on the server — the championUntil timestamp is the
// source of truth, not the doc's presence).
//
// Used by the Hall banner, NameLink crown badge, and the chess-screen
// player headers. One Firestore listener shared via React context, so
// it stays cheap regardless of how many places surface the crown.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'

export interface CurrentChampion {
  /** Lookup key — lowercased, accent-stripped form. */
  normalizedName: string
  /** Visible name to render in the badge. */
  displayName: string
  /** ISO-week the win came from, for diagnostics + future history view. */
  weekKey: string
  /** Server epoch ms when closeTournament ran. */
  closedAt: number
  /** Server epoch ms when the crown reign ends — the badge hides past this. */
  championUntil: number
}

interface ChampionContextValue {
  /** null when no live champion (none crowned or reign expired). */
  champion: CurrentChampion | null
  /** True while the first snapshot is pending. Lets surfaces hide
   *  flash-of-empty before a real read. */
  loading: boolean
}

const ChampionContext = createContext<ChampionContextValue>({
  champion: null,
  loading: true,
})

export function CurrentChampionProvider({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<CurrentChampion | null>(null)
  const [loading, setLoading] = useState(true)
  // A tick that re-evaluates "is championUntil still in the future?"
  // once a minute — cheap enough and means the badge fades automatically
  // at the 7-day mark even if no nav happens.
  const [, setNow] = useState(Date.now())

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'castle_live', 'current_champion'),
      (snap) => {
        setLoading(false)
        if (!snap.exists()) { setRaw(null); return }
        setRaw(snap.data() as CurrentChampion)
      },
      (err) => {
        // Read errors here are non-critical — the rest of the app still
        // works without the badge. Log once and move on.
        console.warn('[champion] subscription failed', err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const value = useMemo<ChampionContextValue>(() => {
    if (!raw) return { champion: null, loading }
    if (raw.championUntil <= Date.now()) return { champion: null, loading }
    return { champion: raw, loading }
  }, [raw, loading])

  return (
    <ChampionContext.Provider value={value}>
      {children}
    </ChampionContext.Provider>
  )
}

export function useCurrentChampion(): ChampionContextValue {
  return useContext(ChampionContext)
}

/** True when the given normalizedName matches the current live champion. */
export function useIsCurrentChampion(normalizedName?: string | null): boolean {
  const { champion } = useCurrentChampion()
  if (!champion || !normalizedName) return false
  return champion.normalizedName === normalizedName
}
