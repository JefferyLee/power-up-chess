// React context wrapper around the castle identity module. Consumed by
// HallScreen + every game screen so they know which guest is signed in
// and which host is hosting this session.
//
// Theme is applied as a side-effect whenever the session host changes —
// Lucy ↔ Magic Forest, Luca ↔ Starry Universe, no separate theme picker.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyTheme } from '../theme/themes'
import type { HostId } from '../hosts/hosts'
import { hostOnDuty, msUntilNextRotation } from '../hosts/hostOnDuty'
import { CastleContext, type CastleContextValue } from './castleContext'
import {
  clearIdentity,
  loadIdentity,
  saveIdentity,
  type CastleIdentity,
} from './identity'

function themeForHost(hostId: HostId): string {
  return hostId === 'lucy' ? 'magic-forest' : 'starry-universe'
}

export function CastleIdentityProvider({ children }: { children: ReactNode }) {
  // Host on duty is wall-clock driven: same host for every visitor at the
  // same instant. Re-checked on a timer so a tab open across the rotation
  // sees the swap without a manual refresh.
  const [hostId, setHostId] = useState<HostId>(() => hostOnDuty())
  const [identity, setIdentity] = useState<CastleIdentity | null>(() => loadIdentity())

  useEffect(() => {
    let timer: number | null = null
    const schedule = () => {
      const ms = msUntilNextRotation()
      timer = window.setTimeout(() => {
        setHostId(hostOnDuty())
        schedule()
      }, ms + 50)
    }
    schedule()
    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

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

  const clearBonusInfo = useCallback(() => {
    setIdentity((prev) => {
      if (!prev || !prev.lastBonus) return prev
      const updated = { ...prev }
      delete updated.lastBonus
      saveIdentity(updated)
      return updated
    })
  }, [])

  const value = useMemo<CastleContextValue>(
    () => ({ identity, hostId, signIn, signOut, setCastlePoints, clearDecayInfo, clearBonusInfo }),
    [identity, hostId, signIn, signOut, setCastlePoints, clearDecayInfo, clearBonusInfo],
  )

  return <CastleContext.Provider value={value}>{children}</CastleContext.Provider>
}
