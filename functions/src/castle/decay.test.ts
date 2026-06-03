import { describe, expect, it } from 'vitest'
import { applyDecay, computeDecay } from './decay'

const DAY = 24 * 60 * 60 * 1000

// Decay was retuned (functions/src/castle/decay.ts header comment):
//   Days 0–7   : 0 / day  (grace week — never punished)
//   Days 8–30  : 1 / day  (gentle nudge)
//   Days 31+   : 5 / day  (real pressure)
// Tests pinned to those constants below.

describe('computeDecay', () => {
  it('returns 0 throughout the grace week', () => {
    expect(computeDecay(0)).toBe(0)
    expect(computeDecay(0.5)).toBe(0)
    expect(computeDecay(7)).toBe(0)
  })

  it('charges 1 / day during the gentle-nudge tier', () => {
    // Day 8 = first day of tier 2 → 1 pt over the grace baseline.
    expect(computeDecay(8)).toBe(1)
    expect(computeDecay(14)).toBe(7)
    expect(computeDecay(30)).toBe(23)
  })

  it('jumps to 5 / day from day 31', () => {
    // 23 pt locked in from tier 2 (days 8–30) + 5 per day past 30.
    expect(computeDecay(31)).toBe(28)
    expect(computeDecay(40)).toBe(73)
    expect(computeDecay(60)).toBe(173)
  })

  it('keeps climbing past day 30 (no upper cap)', () => {
    expect(computeDecay(60)).toBeGreaterThan(150)
    expect(computeDecay(90)).toBeGreaterThan(300)
  })
})

describe('applyDecay', () => {
  it('takes nothing when the visitor was here today', () => {
    const now = Date.now()
    const r = applyDecay(250, now - 2 * 60 * 60 * 1000, now)
    expect(r.decayedBy).toBe(0)
    expect(r.castlePoints).toBe(250)
  })

  it('takes nothing within the grace week', () => {
    const now = Date.now()
    const r = applyDecay(250, now - 7 * DAY, now)
    expect(r.decayedBy).toBe(0)
    expect(r.castlePoints).toBe(250)
  })

  it('applies the gentle-nudge tier rate (1 / day)', () => {
    const now = Date.now()
    // 14 days absent → 7 pts taken (days 8–14).
    const r = applyDecay(250, now - 14 * DAY, now)
    expect(r.decayedBy).toBe(7)
    expect(r.castlePoints).toBe(243)
  })

  it('floors at 0 — never goes negative', () => {
    const now = Date.now()
    const r = applyDecay(10, now - 60 * DAY, now)
    expect(r.castlePoints).toBe(0)
    expect(r.decayedBy).toBe(10) // capped at the available balance
  })

  it('can drop a guest below the 200-pt unlock with sustained absence', () => {
    // Was at 210, gone 30 days → lose 23 → 187 (re-locked).
    const now = Date.now()
    const r = applyDecay(210, now - 30 * DAY, now)
    expect(r.decayedBy).toBe(23)
    expect(r.castlePoints).toBe(187)
    expect(r.castlePoints).toBeLessThan(200)
  })
})
