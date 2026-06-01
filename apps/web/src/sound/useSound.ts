// Mute-aware play hook + persisted mute state.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { playSound, unlockAudio, type SoundName } from './synth'

const MUTE_KEY = 'puc:muted:v1'

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

function persistMuted(muted: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Quota / privacy mode — ignore.
  }
}

/** Shared state across all hook callers — react via a poor-man's pub/sub. */
const listeners = new Set<(m: boolean) => void>()
let currentMuted = readInitialMuted()

function setMutedGlobal(m: boolean): void {
  if (m === currentMuted) return
  currentMuted = m
  persistMuted(m)
  for (const l of listeners) l(m)
}

export interface SoundApi {
  muted: boolean
  toggleMute: () => void
  play: (name: SoundName) => void
}

export function useSound(): SoundApi {
  const [muted, setMuted] = useState<boolean>(currentMuted)

  useEffect(() => {
    listeners.add(setMuted)
    return () => {
      listeners.delete(setMuted)
    }
  }, [])

  const toggleMute = useCallback(() => {
    setMutedGlobal(!currentMuted)
    if (currentMuted === false) {
      // We just unmuted — make sure the AudioContext is allowed to run now
      // that the user has expressed intent.
      unlockAudio()
    }
  }, [])

  const play = useCallback((name: SoundName) => {
    if (currentMuted) return
    unlockAudio()
    playSound(name)
  }, [])

  // Return a stable object so consumers that put `sound` into useCallback /
  // useEffect dep arrays do not re-fire on every render. Only the `muted`
  // flag actually changes meaningfully.
  return useMemo(() => ({ muted, toggleMute, play }), [muted, toggleMute, play])
}
