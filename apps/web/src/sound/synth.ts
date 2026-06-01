// WebAudio synthesis for game sounds.
//
// No asset files — everything is generated at play time with oscillator +
// gain envelopes. Keeps the bundle small and lets us tune Magic Forest's
// warm, low-key aesthetic without shipping MP3s.

export type SoundName = 'move' | 'capture' | 'check' | 'mate-win' | 'mate-loss' | 'draw' | 'knock' | 'wicket-creak'

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

// Castle gate knock — three rapid raps. Each rap is a short percussive
// thud (triangle wave swept down) to approximate knuckles on wood.
function knock(): void {
  const RAP_SPACING = 0.12
  for (let i = 0; i < 3; i++) {
    tone({
      freq: [180, 80],
      type: 'triangle',
      duration: 0.04,
      peakGain: 0.32,
      attack: 0.002,
      release: 0.04,
      startOffset: i * RAP_SPACING,
    })
    // High-frequency click on top of the thud for the wood "snap".
    tone({
      freq: [1200, 400],
      type: 'square',
      duration: 0.015,
      peakGain: 0.08,
      attack: 0.001,
      release: 0.02,
      startOffset: i * RAP_SPACING,
    })
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

const RECIPES: Record<SoundName, () => void> = {
  move,
  capture,
  check,
  'mate-win': mateWin,
  'mate-loss': mateLoss,
  draw,
  knock,
  'wicket-creak': wicketCreak,
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
