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

/** Soft mechanical "thock" — a low sine that drops in pitch with a
 *  gentle envelope, plus a touch of lowpass-filtered noise for the
 *  key-strike texture. Avoids the bright square-wave shrillness of
 *  the earlier version. Silent if /mute is on. */
export function playKeyClick(): void {
  if (isMuted()) return
  const audio = getContext()
  if (!audio) return
  if (audio.state === 'suspended') {
    void audio.resume()
  }
  const now = audio.currentTime

  // Layer 1: low sine body, slight pitch drop = "thock"
  const body = audio.createOscillator()
  const bodyGain = audio.createGain()
  body.type = 'sine'
  const startHz = 230 + Math.random() * 30
  body.frequency.setValueAtTime(startHz, now)
  body.frequency.exponentialRampToValueAtTime(startHz * 0.6, now + 0.06)
  bodyGain.gain.setValueAtTime(0.0001, now)
  bodyGain.gain.exponentialRampToValueAtTime(0.045, now + 0.006)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  body.connect(bodyGain).connect(audio.destination)
  body.start(now)
  body.stop(now + 0.1)

  // Layer 2: very short lowpass-filtered noise burst = key strike
  // texture. Filtering well below ~1 kHz keeps it warm, not hissy.
  const noiseDur = 0.018
  const sampleRate = audio.sampleRate
  const buffer = audio.createBuffer(1, Math.ceil(sampleRate * noiseDur), sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  }
  const noise = audio.createBufferSource()
  noise.buffer = buffer
  const noiseFilter = audio.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.value = 900
  const noiseGain = audio.createGain()
  noiseGain.gain.setValueAtTime(0.025, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur)
  noise.connect(noiseFilter).connect(noiseGain).connect(audio.destination)
  noise.start(now)
}
