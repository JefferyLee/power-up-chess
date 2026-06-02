// usePresenceHeartbeat — call setPresence on mount + every 20s.
// Cleared on unmount or when identity disappears.
//
// The optional `location` arg tells the server where this presence row
// should appear. Default = Hall. Pass `{ kind: 'wizard', roomId }` from
// the duel screen and `{ kind: 'chess', roomId }` from the chess room
// screen so the Hall sidebar can show "who's playing where".

import { useEffect, useRef } from 'react'
import { callSetPresence, type LocationTag } from '../firebase/callables'
import { useCastle } from './useCastle'

const HEARTBEAT_MS = 20_000

export function usePresenceHeartbeat(location?: LocationTag) {
  const { identity, hostId } = useCastle()
  const sessionIdRef = useRef<string>(makeSessionId())
  // Keep latest location in a ref so the interval doesn't reset every
  // time the parent rerenders with the same logical location.
  const locationRef = useRef<LocationTag | undefined>(location)
  const locationKey =
    location?.kind === 'hall' || location === undefined
      ? location?.kind ?? 'none'
      : `${location.kind}:${location.roomId}`
  useEffect(() => {
    locationRef.current = location
    // locationKey is included so this effect runs when the logical
    // location changes; `location` itself is excluded because new
    // object identity each render would re-fire pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey])

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
          location: locationRef.current,
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
