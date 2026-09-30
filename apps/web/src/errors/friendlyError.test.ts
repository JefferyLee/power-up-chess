import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCode, friendlyError, looksHuman } from './friendlyError'

class FakeFirebaseError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'FirebaseError'
    this.code = code
  }
}
const fb = (code: string, message = 'x y z.') => new FakeFirebaseError(`functions/${code}`, message)

describe('friendlyError', () => {
  let warn: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })
  afterEach(() => warn.mockRestore())

  it('maps every listed HttpsError code to a warm sentence, never the raw text', () => {
    const codes = [
      'unauthenticated', 'permission-denied', 'failed-precondition', 'resource-exhausted',
      'unavailable', 'deadline-exceeded', 'not-found', 'invalid-argument',
    ]
    for (const code of codes) {
      const out = friendlyError(fb(code, 'normalizedName required.'))
      expect(out, code).not.toMatch(/normalizedName|required/)
      expect(out, code).toMatch(/[.!]$/)
      expect(out.length, code).toBeLessThan(160)
    }
  })

  it('keeps a human server message for rule-type codes', () => {
    expect(friendlyError(fb('failed-precondition', 'Not your turn.'))).toBe('Not your turn.')
    expect(friendlyError(fb('failed-precondition', 'Not enough castle points (need 50).'))).toBe('Not enough castle points (need 50).')
    expect(friendlyError(fb('resource-exhausted', 'Slow down — max 10/min in this duel.'))).toBe('Slow down — max 10/min in this duel.')
    expect(friendlyError(fb('not-found', 'Team not found.'))).toBe('Team not found.')
  })

  it('replaces developer-ish server messages', () => {
    expect(friendlyError(fb('invalid-argument', 'roomId required.'))).not.toContain('roomId')
    expect(friendlyError(fb('invalid-argument', 'Bad payload.'))).not.toContain('payload')
    expect(friendlyError(fb('failed-precondition', 'Guest record missing.'))).not.toContain('missing')
    expect(friendlyError(fb('unauthenticated', 'Sign in first.'))).toContain('gate')
  })

  it('names network trouble and offline separately', () => {
    expect(friendlyError(new TypeError('Failed to fetch'))).toMatch(/connection|Wi-Fi/)
    expect(friendlyError(new FakeFirebaseError('auth/network-request-failed', 'x'))).toMatch(/connection/)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    expect(friendlyError(fb('not-found', 'Room not found.'))).toMatch(/offline/)
  })

  it('falls back to a generic line, with the context when given', () => {
    expect(friendlyError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(
      'Something went wrong on our side, not yours. Try again in a moment.',
    )
    expect(friendlyError('boom', 'loading your games')).toBe(
      'Something went wrong while loading your games — on our side, not yours. Try again in a moment.',
    )
    expect(friendlyError(fb('internal', 'INTERNAL'), 'saving')).toMatch(/while saving/)
  })

  it('keeps the raw error reachable on the console', () => {
    const err = fb('permission-denied', 'Admin only.')
    friendlyError(err, 'featuring a game')
    expect(warn).toHaveBeenCalledWith('[puc] featuring a game:', err)
  })

  it('reads codes with or without a Firebase prefix', () => {
    expect(errorCode(fb('not-found'))).toBe('not-found')
    expect(errorCode({ code: 'permission-denied' })).toBe('permission-denied')
    expect(errorCode(new Error('plain'))).toBeNull()
    expect(errorCode(null)).toBeNull()
  })

  it('looksHuman rejects identifiers and accepts sentences', () => {
    expect(looksHuman('Not your turn.')).toBe(true)
    expect(looksHuman('This account can’t post in the Hall.')).toBe(true)
    expect(looksHuman('normalizedName required.')).toBe(false)
    expect(looksHuman('Failed to fetch')).toBe(false)
    expect(looksHuman('Bad name.')).toBe(false)
  })
})
