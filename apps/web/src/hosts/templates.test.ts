import { describe, expect, it } from 'vitest'
import {
  TemplatePicker,
  mulberry32,
  __TEMPLATE_POOLS_FOR_TEST,
} from './templates'
import type { HostId } from './hosts'

describe('template pools', () => {
  const hosts: HostId[] = ['lucy', 'luca']

  it.each(hosts)('%s has at least 10 ordinary lines (variety for chatty path)', (host) => {
    expect(__TEMPLATE_POOLS_FOR_TEST[host].ordinary.length).toBeGreaterThanOrEqual(10)
  })

  it.each(hosts)('%s has at least 5 capture lines', (host) => {
    expect(__TEMPLATE_POOLS_FOR_TEST[host].capture.length).toBeGreaterThanOrEqual(5)
  })

  it.each(hosts)('%s has at least 1 line for every kind', (host) => {
    for (const pool of Object.values(__TEMPLATE_POOLS_FOR_TEST[host])) {
      expect(pool.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('TemplatePicker', () => {
  it('20 consecutive ordinary picks produce at least 10 distinct strings', () => {
    const picker = new TemplatePicker(42)
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
      seen.add(picker.pick('lucy', 'ordinary'))
    }
    expect(seen.size).toBeGreaterThanOrEqual(10)
  })

  it('never repeats the immediately-previous line', () => {
    const picker = new TemplatePicker(7)
    let prev = ''
    for (let i = 0; i < 50; i++) {
      const line = picker.pick('luca', 'ordinary')
      expect(line).not.toBe(prev)
      prev = line
    }
  })

  it('is deterministic given a seed', () => {
    const a = new TemplatePicker(123)
    const b = new TemplatePicker(123)
    for (let i = 0; i < 30; i++) {
      expect(a.pick('lucy', 'ordinary')).toBe(b.pick('lucy', 'ordinary'))
    }
  })

  it('capture template interpolates the captured piece name', () => {
    const picker = new TemplatePicker(0)
    // Run a few times to ensure at least one interpolating template fires.
    let sawPieceWord = false
    for (let i = 0; i < 12; i++) {
      const line = picker.pick('lucy', 'capture', { capturedPiece: 'n' })
      if (/knight/i.test(line)) sawPieceWord = true
    }
    expect(sawPieceWord).toBe(true)
  })

  it('checkmate-win interpolates the winner name', () => {
    const picker = new TemplatePicker(0)
    let sawName = false
    for (let i = 0; i < 8; i++) {
      const line = picker.pick('luca', 'checkmate-win', { winnerName: 'Ada' })
      if (line.includes('Ada')) sawName = true
    }
    expect(sawName).toBe(true)
  })

  it('mulberry32 yields stable values', () => {
    const rng = mulberry32(1)
    // Sanity that the PRNG is in [0,1) and consistent.
    const out = [rng(), rng(), rng()]
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of out) expect(v).toBeLessThan(1)
    const again = mulberry32(1)
    expect([again(), again(), again()]).toEqual(out)
  })
})
