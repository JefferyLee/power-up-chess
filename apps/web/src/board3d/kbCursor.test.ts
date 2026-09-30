import { describe, expect, it } from 'vitest'
import { describeAction, describeSquare, stepCursor } from './kbCursor'

const none = new Set<never>()

describe('stepCursor', () => {
  it('ignores non-arrow keys', () => {
    expect(stepCursor('e4', 'Enter', 'w')).toBeNull()
    expect(stepCursor(null, 'a', 'w')).toBeNull()
  })
  it('starts from the home square when there is no cursor', () => {
    expect(stepCursor(null, 'ArrowUp', 'w')).toBe('e3')
    expect(stepCursor(null, 'ArrowUp', 'b')).toBe('e6')
  })
  it('walks in board coordinates from the player side', () => {
    expect(stepCursor('d4', 'ArrowRight', 'w')).toBe('e4')
    expect(stepCursor('d4', 'ArrowRight', 'b')).toBe('c4')
    expect(stepCursor('d4', 'ArrowDown', 'w')).toBe('d3')
    expect(stepCursor('d4', 'ArrowDown', 'b')).toBe('d5')
  })
  it('clamps at the edges', () => {
    expect(stepCursor('a1', 'ArrowLeft', 'w')).toBe('a1')
    expect(stepCursor('h8', 'ArrowUp', 'w')).toBe('h8')
    expect(stepCursor('a1', 'ArrowRight', 'b')).toBe('a1')
  })
})

describe('describeSquare', () => {
  it('names the piece, or empty', () => {
    expect(describeSquare('e2', { type: 'p', color: 'w' }, none, none)).toBe('e2, white pawn')
    expect(describeSquare('e4', null, none, none)).toBe('e4, empty')
  })
  it('flags legal moves and captures', () => {
    expect(describeSquare('e4', null, new Set(['e4']), none)).toBe('e4, empty, legal move')
    expect(describeSquare('d5', { type: 'n', color: 'b' }, new Set(['d5']), new Set(['d5'])))
      .toBe('d5, black knight, capture available')
  })
})

describe('describeAction', () => {
  const pawn = { type: 'p', color: 'w' } as const
  const knight = { type: 'n', color: 'b' } as const
  it('selects an own piece', () => {
    expect(describeAction('e2', pawn, null, null, none, 'w')).toBe('e2 pawn selected')
  })
  it('announces moves and captures', () => {
    expect(describeAction('e4', null, 'e2', pawn, new Set(['e4']), 'w')).toBe('pawn e2 to e4')
    expect(describeAction('d5', knight, 'e4', pawn, new Set(['d5']), 'w')).toBe('pawn e4 takes d5')
  })
  it('clears on the selected square or a dead square', () => {
    expect(describeAction('e2', pawn, 'e2', pawn, none, 'w')).toBe('Selection cleared')
    expect(describeAction('h8', null, 'e2', pawn, none, 'w')).toBe('Selection cleared')
  })
  it('nudges when nothing is selected and the square is not yours', () => {
    expect(describeAction('e7', knight, null, null, none, 'w')).toBe('Pick one of your pieces first')
  })
})
