// Mechanical-keyboard click for the Castle Terminal. Synthesized via
// Web Audio so we ship no audio asset, and so we can re-trigger
// rapidly without sample latency.
//
// The AudioContext is lazily created on the first click — browsers
// require a user gesture to unlock audio playback. Since the kid types
// to trigger this, that's always satisfied.

const MUTE_KEY = 'puc:terminal-muted'

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  return ctx
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(MUTE_KEY) === '1'
}

export function setMuted(next: boolean): void {
  if (typeof window === 'undefined') return
  if (next) window.localStorage.setItem(MUTE_KEY, '1')
  else window.localStorage.removeItem(MUTE_KEY)
}

export function toggleMuted(): boolean {
  const next = !isMuted()
  setMuted(next)
  return next
}

/** Short 40 ms square-wave tick with a sharp envelope — sounds like a
 *  soft chiclet key. Silent if /mute is on. */
export function playKeyClick(): void {
  if (isMuted()) return
  const audio = getContext()
  if (!audio) return
  if (audio.state === 'suspended') {
    void audio.resume()
  }
  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  // Slight pitch jitter so rapid typing doesn't sound metronomic.
  osc.frequency.value = 1100 + Math.random() * 200
  osc.type = 'square'
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(now)
  osc.stop(now + 0.05)
}
