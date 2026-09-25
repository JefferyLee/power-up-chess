import { describe, expect, it } from 'vitest'
import { Timeline, easeOutCubic } from './timeline'

describe('Timeline', () => {
  it('interpolates tracks, holding before the first and after the last key', () => {
    const o = { x: 0 }
    const tl = new Timeline(2).track(o, 'x', [{ t: 1.5, v: 10 }, { t: 0.5, v: 0 }])
    tl.tick(0.25)
    expect(o.x).toBe(0)
    tl.tick(0.75) // t = 1.0 → halfway through the 0.5→1.5 segment
    expect(o.x).toBeCloseTo(5)
    tl.tick(1) // t = 2 (clamped) → finished
    expect(o.x).toBe(10)
    expect(tl.done).toBe(true)
  })

  it('applies the segment easing', () => {
    const o = { x: 0 }
    const tl = new Timeline(1).track(o, 'x', [{ t: 0, v: 0 }, { t: 1, v: 1, ease: easeOutCubic }])
    tl.tick(0.5)
    expect(o.x).toBeCloseTo(easeOutCubic(0.5))
  })

  it('fires each cue once, in time order, and finish() fires the rest', () => {
    const log: string[] = []
    const tl = new Timeline(3)
      .at(2, () => log.push('b'))
      .at(1, () => log.push('a'))
      .at(2.5, () => log.push('c'))
    tl.tick(1.2)
    tl.tick(0.1)
    expect(log).toEqual(['a'])
    tl.finish()
    expect(log).toEqual(['a', 'b', 'c'])
    tl.finish()
    expect(log).toEqual(['a', 'b', 'c'])
  })

  it('skip() ramps the rate up so the rest plays faster', () => {
    const slow = new Timeline(4)
    const fast = new Timeline(4)
    fast.skip()
    let n = 0
    while (!fast.tick(1 / 60)) n++
    expect(n).toBeLessThan(60) // < 1 s of frames for 4 s of scene
    let m = 0
    while (!slow.tick(1 / 60)) m++
    expect(m).toBeGreaterThan(200)
  })

  it('play() resolves when the timeline finishes', async () => {
    const tl = new Timeline(0.1)
    const p = tl.play()
    tl.tick(0.2)
    await expect(p).resolves.toBeUndefined()
  })
})
