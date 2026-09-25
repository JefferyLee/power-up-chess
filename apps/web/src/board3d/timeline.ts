// Timeline — a tiny keyframe timeline for scripted 3D choreography
// (the capture duel in Board3D). Numeric tracks with per-segment
// easing, one-shot `at(t, fn)` cues, and a playback rate that RAMPS
// toward a target so Skip accelerates the scene instead of cutting it.
// Pure TypeScript — no three.js, no React — so it unit-tests in vitest.

export type Ease = (t: number) => number

export const linear: Ease = (t) => t
export const easeInOutCubic: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3)
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** A keyframe. `ease` shapes the segment that ENDS at this key. */
export interface Key {
  t: number
  v: number
  ease?: Ease
}

interface Track {
  obj: Record<string, number>
  key: string
  keys: Key[]
}

interface Cue {
  t: number
  fn: () => void
  fired: boolean
}

/** How long the playback rate takes to reach a new target (seconds). */
const RATE_RAMP = 0.15

export class Timeline {
  readonly duration: number
  time = 0
  rate = 1
  targetRate = 1
  done = false
  private tracks: Track[] = []
  private cues: Cue[] = []
  private tickFns: Array<(t: number) => void> = []
  private resolve: (() => void) | null = null

  constructor(duration: number) {
    this.duration = duration
  }

  /** Animate `obj[key]` through `keys` (any order — sorted here). */
  track(obj: Record<string, number>, key: string, keys: Key[]): this {
    this.tracks.push({ obj, key, keys: [...keys].sort((a, b) => a.t - b.t) })
    return this
  }

  /** Fire `fn` once, the first time playback reaches `t`. */
  at(t: number, fn: () => void): this {
    this.cues.push({ t, fn, fired: false })
    this.cues.sort((a, b) => a.t - b.t)
    return this
  }

  /** Called after the tracks are applied, every tick. */
  onTick(fn: (t: number) => void): this {
    this.tickFns.push(fn)
    return this
  }

  /** Skip: play the rest at `rate`× (ramped in, not cut). */
  skip(rate = 8): void {
    this.targetRate = rate
  }

  play(): Promise<void> {
    return new Promise((res) => {
      if (this.done) res()
      else this.resolve = res
    })
  }

  /** Advance by `dt` real seconds. Returns true once finished. */
  tick(dt: number): boolean {
    if (this.done) return true
    this.rate += (this.targetRate - this.rate) * Math.min(1, dt / RATE_RAMP)
    this.time = Math.min(this.duration, this.time + dt * this.rate)
    this.apply(this.time)
    if (this.time >= this.duration) this.finish()
    return this.done
  }

  /** Jump to the end: every track at its final value, every unfired
   *  cue fired (in order). Safe to call repeatedly. */
  finish(): void {
    if (this.done) return
    this.time = this.duration
    this.apply(this.duration)
    this.done = true
    this.resolve?.()
    this.resolve = null
  }

  private apply(t: number): void {
    for (const tr of this.tracks) tr.obj[tr.key] = sample(tr.keys, t)
    for (const c of this.cues) {
      if (!c.fired && c.t <= t) {
        c.fired = true
        c.fn()
      }
    }
    for (const fn of this.tickFns) fn(t)
  }
}

function sample(keys: Key[], t: number): number {
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (!first || !last) return 0
  if (t <= first.t) return first.v
  if (t >= last.t) return last.v
  let a = first
  for (const b of keys) {
    if (b.t <= t) {
      a = b
      continue
    }
    const p = (t - a.t) / (b.t - a.t)
    return a.v + (b.v - a.v) * (b.ease ?? linear)(p)
  }
  return last.v
}
