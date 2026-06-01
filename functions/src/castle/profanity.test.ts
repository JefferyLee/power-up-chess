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
