import { describe, expect, it } from 'vitest'
import { parseUci } from './parseUci'

describe('parseUci', () => {
  it('parses a simple move', () => {
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' })
  })

  it('parses a promotion', () => {
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
  })

  it.each(['', 'xxxx', 'e2-e4', 'e9e4', 'e2e4z', 'e2', 'e2e4qq', 12 as unknown as string])(
    'rejects malformed input %p',
    (input) => {
      expect(parseUci(input)).toBeNull()
    },
  )
})
