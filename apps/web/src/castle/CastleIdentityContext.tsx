// React context wrapper around the castle identity module. Consumed by
// HallScreen + every game screen so they know which guest is signed in
// and which host is hosting this session.
//
// Theme is applied as a side-effect whenever the session host changes —
// Lucy ↔ Magic Forest, Luca ↔ Starry Universe, no separate theme picker.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme } from '../theme/themes'
import type { HostId } from '../hosts/hosts'
import { CastleContext, type CastleContextValue } from './castleContext'
import {
  clearIdentity,
  loadIdentity,
  saveIdentity,
  sessionHost,
  type CastleIdentity,
} from './identity'

function themeForHost(hostId: HostId): string {
  return hostId === 'lucy' ? 'magic-forest' : 'starry-universe'
}

export function CastleIdentityProvider({ children }: { children: ReactNode }) {
  const [hostId] = useState<HostId>(() => sessionHost())
  const [identity, setIdentity] = useState<CastleIdentity | null>(() => loadIdentity())

  // Apply the host-bound theme on mount + whenever the host changes.
  useEffect(() => {
    applyTheme(themeForHost(hostId))
  }, [hostId])

  const signIn = useCallback((next: CastleIdentity) => {
    saveIdentity(next)
    setIdentity(next)
  }, [])

  const signOut = useCallback(() => {
    clearIdentity()
    setIdentity(null)
  }, [])

  const setCastlePoints = useCallback((next: number) => {
    setIdentity((prev) => {
      if (!prev) return prev
      const updated = { ...prev, castlePoints: next }
      saveIdentity(updated)
      return updated
    })
  }, [])

  const clearDecayInfo = useCallback(() => {
    setIdentity((prev) => {
      if (!prev || !prev.lastDecay) return prev
      const updated = { ...prev }
      delete updated.lastDecay
      saveIdentity(updated)
      return updated
    })
  }, [])

  const value = useMemo<CastleContextValue>(
    () => ({ identity, hostId, signIn, signOut, setCastlePoints, clearDecayInfo }),
    [identity, hostId, signIn, signOut, setCastlePoints, clearDecayInfo],
  )

  return <CastleContext.Provider value={value}>{children}</CastleContext.Provider>
}
