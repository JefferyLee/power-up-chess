import { describe, expect, it } from 'vitest'
import { applyDecay, computeDecay } from './decay'

const DAY = 24 * 60 * 60 * 1000

describe('computeDecay', () => {
  it('returns 0 for less than a day absent', () => {
    expect(computeDecay(0)).toBe(0)
    expect(computeDecay(0.5)).toBe(0)
    expect(computeDecay(0.999)).toBe(0)
  })

  it('matches the two anchor points from MVP2_PLAN §7.4', () => {
    expect(computeDecay(1)).toBe(5)
    expect(computeDecay(7)).toBe(50)
  })

  it('ramps linearly between the anchors', () => {
    // (50 - 5) / (7 - 1) = 7.5 per day after day 1.
    expect(computeDecay(2)).toBe(13) // 5 + 7.5 = 12.5 → round to 13
    expect(computeDecay(3)).toBe(20) // 5 + 15 = 20
    expect(computeDecay(4)).toBe(28) // 5 + 22.5 = 27.5 → 28
  })

  it('keeps climbing past day 7 (no upper cap)', () => {
    expect(computeDecay(14)).toBeGreaterThan(50)
    expect(computeDecay(30)).toBeGreaterThan(200)
  })
})

describe('applyDecay', () => {
  it('takes nothing when the visitor was here today', () => {
    const now = Date.now()
    const r = applyDecay(250, now - 2 * 60 * 60 * 1000, now)
    expect(r.decayedBy).toBe(0)
    expect(r.castlePoints).toBe(250)
  })

  it('applies the day-7 anchor loss', () => {
    const now = Date.now()
    const r = applyDecay(250, now - 7 * DAY, now)
    expect(r.decayedBy).toBe(50)
    expect(r.castlePoints).toBe(200)
  })

  it('floors at 0 — never goes negative', () => {
    const now = Date.now()
    const r = applyDecay(10, now - 30 * DAY, now)
    expect(r.castlePoints).toBe(0)
    expect(r.decayedBy).toBe(10) // capped
  })

  it('re-locks when decay drops a guest below 200', () => {
    // Was at 210, gone 2 days → lose 13 → 197 (re-locked).
    const now = Date.now()
    const r = applyDecay(210, now - 2 * DAY, now)
    expect(r.decayedBy).toBe(13)
    expect(r.castlePoints).toBe(197)
    expect(r.castlePoints).toBeLessThan(200)
  })
})
