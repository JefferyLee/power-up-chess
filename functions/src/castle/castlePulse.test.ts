// castlePulse — the Corner of Babel's door light must only ever see counts.

import { describe, expect, it } from 'vitest'
import { PULSE_ORIGINS, publicPulse } from './castlePulse'
import type { CastleLivePulse } from './refreshCastleLivePulse'

const full: CastleLivePulse = {
  duelsInProgress: 1,
  visitorsToday: 9,
  inHallNow: [{ displayName: 'Ada' }],
  inCastleNow: 2,
  topSolversToday: [{ displayName: 'Ada', count: 4 }],
  recentDuels: [{ text: 'Ada beat Luca', ts: 1700 }],
  lastStory: { hostId: 'lucy', snippet: 'Once…', body: 'Once upon a board…', ts: 1600 },
  refreshedAt: 1700,
}

describe('publicPulse', () => {
  it('keeps the counts and drops every name and story', () => {
    expect(publicPulse(full)).toEqual({
      inCastleNow: 2,
      duelsInProgress: 1,
      visitorsToday: 9,
      refreshedAt: 1700,
    })
  })

  it('is all zeros when the pulse doc is missing', () => {
    expect(publicPulse(undefined)).toEqual({
      inCastleNow: 0,
      duelsInProgress: 0,
      visitorsToday: 0,
      refreshedAt: 0,
    })
  })

  it('treats a pulse written before inCastleNow existed, or junk, as zero', () => {
    const old: Partial<CastleLivePulse> = { duelsInProgress: 3, refreshedAt: 5 }
    expect(publicPulse(old).inCastleNow).toBe(0)
    const junk = { inCastleNow: -3, duelsInProgress: Number.NaN, visitorsToday: '7' }
    expect(publicPulse(junk as unknown as Partial<CastleLivePulse>)).toEqual({
      inCastleNow: 0,
      duelsInProgress: 0,
      visitorsToday: 0,
      refreshedAt: 0,
    })
  })

  it('opens CORS only to the library', () => {
    expect(PULSE_ORIGINS).toEqual(['https://cornerofbabel.com', 'https://staging.cornerofbabel.com'])
  })
})
