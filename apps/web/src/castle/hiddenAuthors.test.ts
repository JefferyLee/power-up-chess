import { beforeEach, describe, expect, it } from 'vitest'
import { hideAuthor, loadHiddenAuthors, unhideAuthor } from './hiddenAuthors'

const KEY = 'puc:chat-hidden-authors:v1'

describe('hiddenAuthors (hide for me)', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts empty and survives malformed storage', () => {
    expect(loadHiddenAuthors()).toEqual([])
    window.localStorage.setItem(KEY, '{not json')
    expect(loadHiddenAuthors()).toEqual([])
    window.localStorage.setItem(KEY, JSON.stringify(['ada', 7, '']))
    expect(loadHiddenAuthors()).toEqual(['ada'])
  })

  it('hides once per author and unhides', () => {
    hideAuthor('troll')
    hideAuthor('troll')
    hideAuthor('')
    expect(loadHiddenAuthors()).toEqual(['troll'])
    unhideAuthor('troll')
    expect(loadHiddenAuthors()).toEqual([])
  })
})
