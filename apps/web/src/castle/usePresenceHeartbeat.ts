// usePresenceHeartbeat — call setPresence on mount + every 20s.
// Cleared on unmount or when identity disappears.

import { useEffect, useRef } from 'react'
import { callSetPresence } from '../firebase/callables'
import { useCastle } from './useCastle'

const HEARTBEAT_MS = 20_000

export function usePresenceHeartbeat() {
  const { identity, hostId } = useCastle()
  const sessionIdRef = useRef<string>(makeSessionId())

  useEffect(() => {
    if (!identity) return
    const sessionId = sessionIdRef.current
    let cancelled = false

    const beat = async () => {
      if (cancelled || !identity) return
      try {
        await callSetPresence({
          sessionId,
          displayName: identity.displayName,
          normalizedName: identity.normalizedName,
          hostId,
          isBypass: identity.isBypass,
        })
      } catch (err) {
        // Don't block the Hall on a failed beat — next interval will retry.
        console.warn('presence heartbeat failed:', err)
      }
    }

    void beat()
    const id = window.setInterval(beat, HEARTBEAT_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [identity, hostId])
}

function makeSessionId(): string {
  // 12-char random session id — used as the presence doc key.
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}
