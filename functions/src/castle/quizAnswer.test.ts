import { describe, expect, it } from 'vitest'
import { answerMatches, canonicalTokens, normalizeAnswer } from './quizAnswer'

describe('normalizeAnswer', () => {
  it('lowercases, strips punctuation and collapses spaces', () => {
    expect(normalizeAnswer('  The Knight!  ')).toBe('the knight')
  })
})

describe('canonicalTokens', () => {
  it('turns number words and ordinals into digits', () => {
    expect(canonicalTokens('sixteenth century')).toEqual(['16', 'century'])
    expect(canonicalTokens('16th century')).toEqual(['16', 'century'])
    expect(canonicalTokens('twenty-first')).toEqual(['21'])
    expect(canonicalTokens('fortieth')).toEqual(['40'])
    expect(canonicalTokens('three')).toEqual(['3'])
  })
  it('drops a leading article', () => {
    expect(canonicalTokens('the knight')).toEqual(['knight'])
    expect(canonicalTokens('a')).toEqual(['a'])
  })
})

describe('answerMatches', () => {
  const century = ['sixteenth century', '16th century', '1500s']
  it('accepts the number forms the story used', () => {
    expect(answerMatches('sixteenth', century)).toBe(true)
    expect(answerMatches('16th', century)).toBe(true)
    expect(answerMatches('the 16th century', century)).toBe(true)
    expect(answerMatches('1500s', century)).toBe(true)
  })
  it('rejects a trailing word or a different number', () => {
    expect(answerMatches('century', century)).toBe(false)
    expect(answerMatches('17th century', century)).toBe(false)
    expect(answerMatches('1600s', century)).toBe(false)
  })
  it('ignores articles and punctuation on either side', () => {
    expect(answerMatches('Knight!', ['the knight'])).toBe(true)
    expect(answerMatches('the knight', ['knight'])).toBe(true)
    expect(answerMatches('queen', ['knight'])).toBe(false)
  })
  it('needs at least two characters', () => {
    expect(answerMatches('', ['knight'])).toBe(false)
    expect(answerMatches('k', ['knight'])).toBe(false)
  })
})
