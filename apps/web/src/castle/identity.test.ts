import { describe, expect, it } from 'vitest'
import { generateBypassName, hashMagicWord, normalizeName } from './identity'
import { hostOnDuty, msUntilNextRotation } from '../hosts/hostOnDuty'

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Ada  ')).toBe('ada')
    expect(normalizeName('LUCY')).toBe('lucy')
  })
})

describe('hashMagicWord', () => {
  it('produces deterministic hex digests', async () => {
    const a = await hashMagicWord('Ada', 'apple-pie')
    const b = await hashMagicWord('ada', 'apple-pie')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('differs across magic words', async () => {
    const a = await hashMagicWord('Ada', 'apple-pie')
    const b = await hashMagicWord('Ada', 'apple-tart')
    expect(a).not.toBe(b)
  })
  it('differs across names', async () => {
    const a = await hashMagicWord('Ada', 'apple-pie')
    const b = await hashMagicWord('Eda', 'apple-pie')
    expect(a).not.toBe(b)
  })
})

describe('generateBypassName', () => {
  it('produces a Guest-NNNN name', () => {
    for (let i = 0; i < 20; i++) {
      const name = generateBypassName()
      expect(name).toMatch(/^Guest-\d{4}$/)
    }
  })
})

describe('hostOnDuty', () => {
  it('returns the same host for the same wall-clock hour', () => {
    const now = new Date('2026-06-01T10:23:00Z').getTime()
    const later = new Date('2026-06-01T10:59:59Z').getTime()
    expect(hostOnDuty(now)).toBe(hostOnDuty(later))
  })
  it('flips between consecutive hours', () => {
    const ten = new Date('2026-06-01T10:00:00Z').getTime()
    const eleven = new Date('2026-06-01T11:00:00Z').getTime()
    expect(hostOnDuty(ten)).not.toBe(hostOnDuty(eleven))
  })
  it('returns either lucy or luca', () => {
    expect(['lucy', 'luca']).toContain(hostOnDuty(0))
    expect(['lucy', 'luca']).toContain(hostOnDuty(Date.now()))
  })
  it('msUntilNextRotation is within (0, 1h]', () => {
    const HOUR = 60 * 60 * 1000
    const ms = msUntilNextRotation()
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(HOUR)
  })
})
