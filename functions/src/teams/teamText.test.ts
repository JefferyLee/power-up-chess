import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { assertCleanTeamText } from './teamText'

function codeOf(fn: () => void): string {
  try {
    fn()
    return 'ok'
  } catch (e) {
    return e instanceof HttpsError ? e.code : `non-https:${String(e)}`
  }
}

describe('assertCleanTeamText', () => {
  it('lets ordinary names and mottos through', () => {
    expect(codeOf(() => assertCleanTeamText('name', 'Golden Knights'))).toBe('ok')
    expect(codeOf(() => assertCleanTeamText('motto', 'Castle first, then the world!'))).toBe('ok')
  })

  it('ignores an empty motto', () => {
    expect(codeOf(() => assertCleanTeamText('motto', ''))).toBe('ok')
  })

  it('rejects severe terms outright (no starred-out version)', () => {
    expect(codeOf(() => assertCleanTeamText('name', 'porn kings'))).toBe('invalid-argument')
  })

  it('rejects ordinary profanity too — a starred team name is still a bad name', () => {
    expect(codeOf(() => assertCleanTeamText('name', 'the shit squad'))).toBe('invalid-argument')
  })

  it('rejects mottos that carry contact details', () => {
    expect(codeOf(() => assertCleanTeamText('motto', 'text me at 415-555-0123'))).toBe('invalid-argument')
    expect(codeOf(() => assertCleanTeamText('motto', 'email ada@example.com'))).toBe('invalid-argument')
  })

  it('names the field in the message so the kid knows what to change', () => {
    try {
      assertCleanTeamText('motto', 'ada@example.com')
      throw new Error('expected a throw')
    } catch (e) {
      expect((e as HttpsError).message).toContain('team motto')
    }
  })
})
