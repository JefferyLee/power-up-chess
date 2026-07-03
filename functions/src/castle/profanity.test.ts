import { describe, expect, it } from 'vitest'
import { scrubMessage } from './profanity'

describe('scrubMessage', () => {
  it('passes clean text through unchanged', () => {
    const r = scrubMessage('hello @lucy what is a pawn fork?')
    expect(r.text).toBe('hello @lucy what is a pawn fork?')
    expect(r.censored).toBe(false)
    expect(r.reasons).toEqual([])
  })

  it('censors a profanity word', () => {
    const r = scrubMessage('that move was shit')
    expect(r.text).toBe('that move was ****')
    expect(r.censored).toBe(true)
    expect(r.reasons).toContain('profanity')
  })

  it('does not censor an embedded substring that is not a whole word', () => {
    // word boundary check prevents "classic" from matching "ass"
    const r = scrubMessage('this is a classic opening')
    expect(r.text).toBe('this is a classic opening')
    expect(r.censored).toBe(false)
  })

  it('strips an email address', () => {
    const r = scrubMessage('ping me at ada@example.com please')
    expect(r.text).not.toContain('@example.com')
    expect(r.reasons).toContain('email')
  })

  it('strips a phone number', () => {
    const r = scrubMessage('call me at 415-555-1212')
    expect(r.text).not.toContain('415-555-1212')
    expect(r.reasons).toContain('phone')
  })
})

// ── Phase 1.9 — severe tier + evasion normalisation ──

import { normalizeForDetection } from './profanity'

describe('severe tier (reject, not star-out)', () => {
  it('rejects a slur outright', () => {
    const r = scrubMessage('you are a nigger')
    expect(r.reject).toBe(true)
    expect(r.reasons).toContain('severe')
    expect(r.text).toBe('')
  })
  it('rejects sexual content aimed at kids chat', () => {
    expect(scrubMessage('look up porn').reject).toBe(true)
    expect(scrubMessage('send me a blowjob pic').reject).toBe(true)
  })
  it('rejects self-harm bait', () => {
    expect(scrubMessage('kys loser').reject).toBe(true)
  })
  it('catches leetspeak evasion (p0rn, r4pe)', () => {
    expect(scrubMessage('watch p0rn now').reject).toBe(true)
    expect(scrubMessage('r4pe jokes').reject).toBe(true)
  })
  it('catches separator evasion (p.o.r.n / f-a-g-g-o-t)', () => {
    expect(scrubMessage('p.o.r.n').reject).toBe(true)
    expect(scrubMessage('f-a-g-g-o-t').reject).toBe(true)
  })
  it('ordinary profanity still stars out and lands (no reject)', () => {
    const r = scrubMessage('that was a shit move')
    expect(r.reject).toBe(false)
    expect(r.censored).toBe(true)
    expect(r.text).toContain('****')
  })
  it('clean chess talk passes untouched', () => {
    const r = scrubMessage('Nice fork! My knight took both rooks.')
    expect(r.reject).toBe(false)
    expect(r.censored).toBe(false)
    expect(r.text).toBe('Nice fork! My knight took both rooks.')
  })
  it('does not glue separate words into false positives', () => {
    // "cum" appears across a word boundary — single spaces must survive
    // normalisation so this stays clean.
    expect(scrubMessage('the practicum starts today').reject).toBe(false)
    expect(scrubMessage('circum stances').reject).toBe(false)
  })
})

describe('normalizeForDetection', () => {
  it('folds leetspeak', () => {
    expect(normalizeForDetection('h3ll0')).toBe('hello')
  })
  it('drops separators between letters', () => {
    expect(normalizeForDetection('f.u-c_k')).toBe('fuck')
  })
  it('collapses repeated letters', () => {
    expect(normalizeForDetection('fuuuuck')).toBe('fuck')
  })
})
