import { describe, expect, it } from 'vitest'
import { runAutoplay } from './autoplay'
import { LANE, group, mapOf, wave } from './fixtures'

describe('autoplay', () => {
  it('wins a small three-wave map', () => {
    const map = mapOf(LANE, {
      startGold: 200,
      waves: [
        wave([group('pawn', 4, 1)]),
        wave([group('pawn', 6, 0.8), group('knight', 2, 1, 3)]),
        wave([group('pawn', 8, 0.6), group('knight', 3, 0.8, 4)], { hpMult: 1.2 }),
      ],
    })
    const r = runAutoplay(map, 7)
    expect(r.won).toBe(true)
    expect(r.wave).toBe(3)
    expect(r.stars).toBeGreaterThanOrEqual(1)
    expect(r.ticks).toBeLessThan(60_000)
  })

  it('survives a few endless waves from a fake generator', () => {
    const map = mapOf(LANE, { startGold: 300 })
    const r = runAutoplay(map, 3, {
      endlessWaves: 3,
      waveGenerator: (n) => wave([group('pawn', 3 + n, 0.8)], { hpMult: 1 + 0.12 * n }),
    })
    expect(r.won).toBe(true)
    expect(r.wave).toBe(3)
  })
})
