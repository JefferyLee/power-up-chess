// WebAudio synthesis for game sounds.
//
// No asset files — everything is generated at play time with oscillator +
// gain envelopes. Keeps the bundle small and lets us tune Magic Forest's
// warm, low-key aesthetic without shipping MP3s.

export type SoundName =
  | 'move' | 'capture' | 'check' | 'mate-win' | 'mate-loss' | 'draw'
  | 'knock' | 'wicket-creak'
  | 'powerup-classic' | 'powerup-lightning' | 'powerup-comet'

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  masterGain = ctx.createGain()
  masterGain.gain.value = 0.6
  masterGain.connect(ctx.destination)
  return ctx
}

/** Resume the AudioContext on first user gesture — browsers require this. */
export function unlockAudio(): void {
  const c = ensureContext()
  if (c && c.state === 'suspended') {
    void c.resume()
  }
}

function tone(opts: {
  freq: number | [number, number] // single or sweep
  type?: OscillatorType
  attack?: number
  release?: number
  duration: number
  peakGain?: number
  startOffset?: number
}): void {
  const c = ensureContext()
  if (!c || !masterGain) return
  const t0 = c.currentTime + (opts.startOffset ?? 0)
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = opts.type ?? 'sine'
  if (typeof opts.freq === 'number') {
    osc.frequency.setValueAtTime(opts.freq, t0)
  } else {
    osc.frequency.setValueAtTime(opts.freq[0], t0)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freq[1]), t0 + opts.duration)
  }
  const peak = opts.peakGain ?? 0.25
  const attack = opts.attack ?? 0.005
  const release = opts.release ?? 0.08
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  gain.gain.setValueAtTime(peak, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration + release)
  osc.connect(gain).connect(masterGain)
  osc.start(t0)
  osc.stop(t0 + opts.duration + release + 0.02)
}

// Sound recipes — kept short and warm to fit the Magic Forest mood.

function move(): void {
  tone({ freq: [320, 220], type: 'sine', duration: 0.06, peakGain: 0.14, release: 0.05 })
}

function capture(): void {
  tone({ freq: [220, 110], type: 'triangle', duration: 0.08, peakGain: 0.28, release: 0.08 })
  tone({ freq: 660, type: 'sine', duration: 0.05, peakGain: 0.1, release: 0.06, startOffset: 0.01 })
}

function check(): void {
  tone({ freq: 660, type: 'sine', duration: 0.18, peakGain: 0.2, release: 0.15 })
  tone({ freq: 990, type: 'sine', duration: 0.16, peakGain: 0.16, release: 0.18, startOffset: 0.04 })
}

function mateWin(): void {
  // Three ascending notes — major triad-ish.
  tone({ freq: 523, type: 'sine', duration: 0.18, peakGain: 0.22, release: 0.18, startOffset: 0.00 })
  tone({ freq: 659, type: 'sine', duration: 0.18, peakGain: 0.22, release: 0.18, startOffset: 0.16 })
  tone({ freq: 784, type: 'sine', duration: 0.32, peakGain: 0.26, release: 0.28, startOffset: 0.32 })
}

function mateLoss(): void {
  // Two descending warm tones — never harsh.
  tone({ freq: 523, type: 'sine', duration: 0.22, peakGain: 0.2, release: 0.2, startOffset: 0.0 })
  tone({ freq: 392, type: 'sine', duration: 0.32, peakGain: 0.2, release: 0.28, startOffset: 0.20 })
}

function draw(): void {
  tone({ freq: 523, type: 'sine', duration: 0.18, peakGain: 0.18, release: 0.2 })
  tone({ freq: 523, type: 'sine', duration: 0.18, peakGain: 0.16, release: 0.2, startOffset: 0.18 })
}

// A single "knock on heavy wood" — filtered-noise transient + tonal body.
// Real knocks are mostly broadband impulses, not pitched tones; the noise
// burst carries most of the character, with a low resonant tone giving
// the door's "weight".
function woodKnock(startOffset: number): void {
  const c = ensureContext()
  if (!c || !masterGain) return
  const t0 = c.currentTime + startOffset

  // 1) Noise transient — short burst of white noise, lowpassed to ~600 Hz
  //    so it reads as a low wood thud rather than a click.
  const noiseDur = 0.16
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * noiseDur), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    // Linear-decaying noise; slight pre-emphasis for the attack.
    const decay = 1 - i / data.length
    data[i] = (Math.random() * 2 - 1) * decay * decay
  }
  const noise = c.createBufferSource()
  noise.buffer = buffer
  const noiseFilter = c.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.setValueAtTime(600, t0)
  noiseFilter.Q.setValueAtTime(1.2, t0)
  const noiseGain = c.createGain()
  noiseGain.gain.setValueAtTime(0.0001, t0)
  noiseGain.gain.exponentialRampToValueAtTime(0.55, t0 + 0.005)
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + noiseDur)
  noise.connect(noiseFilter).connect(noiseGain).connect(masterGain)
  noise.start(t0)
  noise.stop(t0 + noiseDur + 0.02)

  // 2) Body resonance — a damped sine around 90 Hz gives the door's
  //    thump-after-strike, like wood flexing.
  const body = c.createOscillator()
  body.type = 'sine'
  body.frequency.setValueAtTime(110, t0)
  body.frequency.exponentialRampToValueAtTime(70, t0 + 0.18)
  const bodyGain = c.createGain()
  bodyGain.gain.setValueAtTime(0.0001, t0)
  bodyGain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.008)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
  body.connect(bodyGain).connect(masterGain)
  body.start(t0)
  body.stop(t0 + 0.25)
}

// Castle gate knock — three knocks at the user-requested 0.7 s interval.
function knock(): void {
  const SPACING_S = 0.7
  for (let i = 0; i < 3; i++) {
    woodKnock(i * SPACING_S)
  }
}

// Wicket creak — a slow wood-on-wood pitch bend, like a small door
// swinging open on a stiff hinge. Sawtooth gives the rough overtones.
function wicketCreak(): void {
  tone({
    freq: [240, 170],
    type: 'sawtooth',
    duration: 0.42,
    peakGain: 0.16,
    attack: 0.04,
    release: 0.22,
  })
  // A subtle "settle" note as it stops moving.
  tone({
    freq: [170, 140],
    type: 'triangle',
    duration: 0.18,
    peakGain: 0.08,
    attack: 0.02,
    release: 0.18,
    startOffset: 0.38,
  })
}

// ─── Power Up capture ceremony sounds ───────────────────────────────────
// Each variant pairs with one of the PowerUpCeremony visual styles.

function powerupClassic(): void {
  // Rising whoosh → bright "tink" → fireworks crackle.
  tone({ freq: [180, 980], type: 'sawtooth', duration: 0.34, peakGain: 0.18, attack: 0.02, release: 0.18 })
  tone({ freq: 1568, type: 'sine', duration: 0.16, peakGain: 0.2, release: 0.18, startOffset: 0.34 })
  tone({ freq: 2093, type: 'sine', duration: 0.12, peakGain: 0.15, release: 0.16, startOffset: 0.42 })
  // Crackle: three quick high-freq taps simulating tiny pops.
  for (let i = 0; i < 4; i++) {
    tone({
      freq: 2200 + Math.random() * 800,
      type: 'square',
      duration: 0.025,
      peakGain: 0.07,
      attack: 0.001,
      release: 0.04,
      startOffset: 0.5 + i * 0.07,
    })
  }
}

function powerupLightning(): void {
  // Hard zap with very fast frequency sweep + a low "boom" body.
  const c = ensureContext()
  if (!c || !masterGain) return
  const t0 = c.currentTime

  // Noise zap — narrow band, very brief.
  const noiseDur = 0.18
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * noiseDur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const d = 1 - i / data.length
    data[i] = (Math.random() * 2 - 1) * d
  }
  const n = c.createBufferSource()
  n.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(1200, t0)
  bp.frequency.exponentialRampToValueAtTime(380, t0 + 0.18)
  bp.Q.setValueAtTime(4, t0)
  const ng = c.createGain()
  ng.gain.setValueAtTime(0.0001, t0)
  ng.gain.exponentialRampToValueAtTime(0.6, t0 + 0.004)
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + noiseDur)
  n.connect(bp).connect(ng).connect(masterGain)
  n.start(t0)
  n.stop(t0 + noiseDur + 0.02)

  // Body — a low sine that drops fast = thunder.
  tone({ freq: [220, 80], type: 'sine', duration: 0.4, peakGain: 0.32, attack: 0.005, release: 0.3, startOffset: 0.04 })
  // Spark on top.
  tone({ freq: 1320, type: 'triangle', duration: 0.1, peakGain: 0.16, release: 0.12, startOffset: 0.02 })
}

function powerupComet(): void {
  // Long descending whoosh + sparkle tail.
  tone({ freq: [1480, 220], type: 'sawtooth', duration: 0.55, peakGain: 0.15, attack: 0.03, release: 0.28 })
  // Twinkle tail of bright sines.
  const tones = [2093, 2349, 2637, 2960]
  tones.forEach((f, i) => {
    tone({
      freq: f,
      type: 'sine',
      duration: 0.1,
      peakGain: 0.08,
      release: 0.18,
      startOffset: 0.18 + i * 0.07,
    })
  })
  // Final burst at the end.
  tone({ freq: 988, type: 'triangle', duration: 0.16, peakGain: 0.18, release: 0.2, startOffset: 0.55 })
}

const RECIPES: Record<SoundName, () => void> = {
  move,
  capture,
  check,
  'mate-win': mateWin,
  'mate-loss': mateLoss,
  draw,
  knock,
  'wicket-creak': wicketCreak,
  'powerup-classic': powerupClassic,
  'powerup-lightning': powerupLightning,
  'powerup-comet': powerupComet,
}

export function playSound(name: SoundName): void {
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') {
    void c.resume()
  }
  RECIPES[name]()
}

export function setMasterVolume(volume: number): void {
  const c = ensureContext()
  if (!c || !masterGain) return
  masterGain.gain.value = Math.max(0, Math.min(1, volume))
}
