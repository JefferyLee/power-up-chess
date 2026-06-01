import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateBypassName,
  hashMagicWord,
  normalizeName,
  sessionHost,
  rerollSessionHost,
} from './identity'

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

describe('sessionHost', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('rolls Lucy or Luca once and persists in sessionStorage', () => {
    const first = sessionHost()
    expect(first === 'lucy' || first === 'luca').toBe(true)
    expect(window.sessionStorage.getItem('puc:session-host:v1')).toBe(first)
    // Re-call returns the same value
    expect(sessionHost()).toBe(first)
  })

  it('rerollSessionHost flips to the other host', () => {
    const mock = vi.spyOn(Math, 'random').mockReturnValue(0.1) // -> lucy
    expect(sessionHost()).toBe('lucy')
    mock.mockRestore()
    expect(rerollSessionHost()).toBe('luca')
    expect(rerollSessionHost()).toBe('lucy')
  })
})
