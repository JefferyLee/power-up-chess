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
// Wicket creak — ~1.5 s composite: low wood groan slow-opening over
// 700 ms, then a hinge squeak transient, then a sparkle chime tail
// (3-note ascending arpeggio) that hints at the magic inside. Replaces
// the old 0.6 s plain saw-tooth which felt thin and abrupt.
function wicketCreak(): void {
  // 1) Low wood groan: sawtooth slow descent, lowpassed, fills 0-700 ms.
  tone({
    freq: [200, 90],
    type: 'sawtooth',
    duration: 0.75,
    peakGain: 0.18,
    attack: 0.08,
    release: 0.4,
  })
  // 2) Rubbing-wood texture under the groan.
  noiseBurst({ startOffset: 0.05, duration: 0.6, freq: 380, q: 1.2, peakGain: 0.12, type: 'bandpass' })
  // 3) Iron hinge squeak — quick high transient ~600 ms in.
  noiseBurst({ startOffset: 0.55, duration: 0.18, freq: 2400, q: 4, peakGain: 0.14, type: 'bandpass' })
  tone({
    freq: [1600, 1900],
    type: 'sine',
    duration: 0.22,
    peakGain: 0.07,
    attack: 0.01,
    release: 0.2,
    startOffset: 0.58,
  })
  // 4) Magic chime tail — ascending three-note sparkle hinting at what's
  //    behind the door. Tuned to a major-9 voicing (E, G#, B, F#) over
  //    ~700 ms so the sound resolves warmly rather than just stopping.
  const chimeStart = 0.85
  ;[659.25, 830.61, 987.77, 1479.98].forEach((f, i) => {
    tone({
      freq: f,
      type: 'sine',
      duration: 0.55 - i * 0.08,
      peakGain: 0.12 - i * 0.015,
      attack: 0.005,
      release: 0.5 - i * 0.06,
      startOffset: chimeStart + i * 0.09,
    })
  })
  // 5) Sub-bass "the door is open" thud at the end.
  tone({
    freq: [120, 60],
    type: 'sine',
    duration: 0.3,
    peakGain: 0.12,
    attack: 0.01,
    release: 0.28,
    startOffset: 1.05,
  })
}

// ─── Power Up capture ceremony sounds ───────────────────────────────────
// Each variant is ~1.5s, multi-layered (sub-bass + body + sparkle + tail)
// so a capture feels like a real win, not a click.

/** Filtered-noise burst — used by lightning/classic/comet for rumble and
 *  texture. Internally creates its own buffer/filter/gain chain. */
function noiseBurst(opts: {
  startOffset: number
  duration: number
  freq: number
  q?: number
  peakGain: number
  type?: 'lowpass' | 'bandpass' | 'highpass'
}): void {
  const c = ensureContext()
  if (!c || !masterGain) return
  const t0 = c.currentTime + opts.startOffset
  const samples = Math.max(1, Math.floor(c.sampleRate * opts.duration))
  const buf = c.createBuffer(1, samples, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const decay = 1 - i / data.length
    data[i] = (Math.random() * 2 - 1) * decay
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'lowpass'
  filter.frequency.setValueAtTime(opts.freq, t0)
  filter.Q.setValueAtTime(opts.q ?? 1, t0)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(Math.min(0.6, opts.peakGain), t0 + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  src.connect(filter).connect(gain).connect(masterGain)
  src.start(t0)
  src.stop(t0 + opts.duration + 0.02)
}

// Classic — Trophy Burst (~1.5s). Big impact → rising swoosh →
// triumphant major triad → bell sparkle cluster → hi-hat tail.
function powerupClassic(): void {
  // 1) Sub-bass kick for instant impact.
  tone({ freq: [120, 40], type: 'sine', duration: 0.35, peakGain: 0.45, attack: 0.002, release: 0.3 })
  // 2) Rising whoosh into the triad.
  tone({ freq: [180, 1480], type: 'sawtooth', duration: 0.5, peakGain: 0.2, attack: 0.04, release: 0.2 })
  // 3) C-E-G major triad at 0.45s — the "tada".
  const triadStart = 0.45
  ;[523.25, 659.25, 783.99].forEach((f, i) => {
    tone({
      freq: f, type: 'triangle', duration: 0.5, peakGain: 0.22,
      attack: 0.01, release: 0.45, startOffset: triadStart + i * 0.02,
    })
  })
  // 4) Sparkle cluster — quick descending bell tones.
  const sparkleStart = 0.85
  ;[2093, 1760, 2349, 1976, 2637, 2093].forEach((f, i) => {
    tone({
      freq: f, type: 'sine', duration: 0.08, peakGain: 0.12,
      release: 0.18, startOffset: sparkleStart + i * 0.06,
    })
  })
  // 5) Highpass-noise hi-hat tail.
  noiseBurst({ startOffset: 1.15, duration: 0.35, freq: 4000, type: 'highpass', peakGain: 0.18 })
}

// Lightning — Thunder Strike (~1.6s). Crack + electric zap → boom →
// long rolling rumble → echo crack → fade tail.
function powerupLightning(): void {
  noiseBurst({ startOffset: 0.0, duration: 0.12, freq: 1800, q: 0.6, peakGain: 0.55 })
  tone({ freq: [3200, 600], type: 'sawtooth', duration: 0.28, peakGain: 0.28, attack: 0.001, release: 0.18 })
  // Bass thunder body — punchy sub-bass swoop.
  tone({ freq: [220, 50], type: 'sine', duration: 0.6, peakGain: 0.5, attack: 0.005, release: 0.45, startOffset: 0.08 })
  // Mid-band rolling rumble.
  noiseBurst({ startOffset: 0.25, duration: 0.95, freq: 280, q: 0.7, peakGain: 0.32 })
  // Echo crack for drama.
  noiseBurst({ startOffset: 0.85, duration: 0.18, freq: 900, q: 0.8, peakGain: 0.22 })
  tone({ freq: [600, 200], type: 'triangle', duration: 0.4, peakGain: 0.16, release: 0.32, startOffset: 0.95 })
  // Tail rumble fading out.
  noiseBurst({ startOffset: 1.15, duration: 0.4, freq: 150, q: 0.6, peakGain: 0.14 })
}

// Comet — Star Streak (~1.5s). Long whoosh → ground thud →
// ascending magical arpeggio → sustained bell → final twinkles.
function powerupComet(): void {
  tone({ freq: [2200, 220], type: 'sawtooth', duration: 0.7, peakGain: 0.18, attack: 0.04, release: 0.3 })
  // Sub-bass thud when the comet "lands".
  tone({ freq: [90, 40], type: 'sine', duration: 0.35, peakGain: 0.4, attack: 0.005, release: 0.3, startOffset: 0.55 })
  // Ascending C-E-G-B-D-F arpeggio (sparkle reveal).
  ;[523.25, 659.25, 783.99, 987.77, 1174.66, 1396.91].forEach((f, i) => {
    tone({
      freq: f, type: 'sine', duration: 0.18, peakGain: 0.16,
      attack: 0.005, release: 0.18, startOffset: 0.3 + i * 0.07,
    })
  })
  // Sustained bell ringing into the tail.
  tone({ freq: 1318.51, type: 'sine', duration: 0.6, peakGain: 0.2, attack: 0.01, release: 0.55, startOffset: 0.75 })
  tone({ freq: 1975.53, type: 'sine', duration: 0.5, peakGain: 0.12, attack: 0.02, release: 0.45, startOffset: 0.78 })
  // Final twinkle cluster.
  ;[2637, 3136, 2349, 3520].forEach((f, i) => {
    tone({
      freq: f, type: 'sine', duration: 0.07, peakGain: 0.1,
      release: 0.15, startOffset: 1.05 + i * 0.08,
    })
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
