// Live-subscribe to a single team doc. Same onSnapshot pattern as
// useWizardRoom / useRoom — reads from `teams/{teamId}` which is
// publicly readable per the Firestore rules.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import type { TeamBadge } from '../firebase/callables'

export interface TeamMember {
  normalizedName: string
  displayName: string
  joinedAt: number
}

export interface Team {
  teamId: string
  name: string
  normalizedName: string
  motto?: string
  badge: TeamBadge
  captainUid: string
  captainNormalizedName: string
  captainDisplayName: string
  members: TeamMember[]
  memberCount: number
  createdAt: number
  lastChangeAt: number
  lastRenamedAt?: number
  lastRebadgedAt?: number
  lastRecruitAt?: number
}

export type TeamState =
  | { kind: 'loading' }
  | { kind: 'ready'; team: Team }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }

export function useTeam(teamId: string | undefined): TeamState {
  const [state, setState] = useState<TeamState>({ kind: 'loading' })
  useEffect(() => {
    if (!teamId) {
      setState({ kind: 'gone' })
      return
    }
    const unsub = onSnapshot(
      doc(db, 'teams', teamId),
      (snap) => {
        if (!snap.exists()) {
          setState({ kind: 'gone' })
          return
        }
        setState({ kind: 'ready', team: snap.data() as Team })
      },
      (err) => {
        setState({ kind: 'error', message: err.message })
      },
    )
    return () => unsub()
  }, [teamId])
  return state
}
