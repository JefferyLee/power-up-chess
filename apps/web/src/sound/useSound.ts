// Mute-aware play hook + persisted mute state.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  playSound,
  setAmbientMuted,
  startAmbient,
  stopAmbient,
  unlockAudio,
  type AmbientName,
  type SoundName,
} from './synth'

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
  // Duck the ambient bed without tearing it down so unmuting brings it
  // straight back. One-shot SFX are gated separately via the play() guard.
  setAmbientMuted(m)
  for (const l of listeners) l(m)
}

export interface SoundApi {
  muted: boolean
  toggleMute: () => void
  play: (name: SoundName) => void
  /** Start a long-running ambient bed. No-op if one is already
   *  playing under the same name. */
  startAmbient: (name: AmbientName) => void
  /** Fade out + tear down the active ambient bed. Safe to call when
   *  nothing is playing. */
  stopAmbient: () => void
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

  const startAmbientCb = useCallback((name: AmbientName) => {
    unlockAudio()
    startAmbient(name)
    // If the user is currently muted, immediately duck — startAmbient
    // would otherwise fade IN to audible while muted.
    if (currentMuted) setAmbientMuted(true)
  }, [])

  const stopAmbientCb = useCallback(() => {
    stopAmbient()
  }, [])

  // Return a stable object so consumers that put `sound` into useCallback /
  // useEffect dep arrays do not re-fire on every render. Only the `muted`
  // flag actually changes meaningfully.
  return useMemo(
    () => ({ muted, toggleMute, play, startAmbient: startAmbientCb, stopAmbient: stopAmbientCb }),
    [muted, toggleMute, play, startAmbientCb, stopAmbientCb],
  )
}
