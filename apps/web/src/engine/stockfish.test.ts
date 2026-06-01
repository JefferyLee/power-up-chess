import { describe, expect, it } from 'vitest'
import { parseInfoLine } from './stockfish'

describe('parseInfoLine', () => {
  it('parses a normal cp evaluation with pv', () => {
    const line =
      'info depth 18 seldepth 24 multipv 1 score cp 35 nodes 12345 nps 50000 pv e2e4 e7e5 g1f3'
    expect(parseInfoLine(line)).toEqual({
      depth: 18,
      cp: 35,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    })
  })

  it('parses a mate score', () => {
    const line = 'info depth 7 score mate 3 pv h5h7 g8h7 d1h5'
    expect(parseInfoLine(line)).toEqual({
      depth: 7,
      mate: 3,
      pv: ['h5h7', 'g8h7', 'd1h5'],
    })
  })

  it('parses negative cp scores', () => {
    const line = 'info depth 10 score cp -120 pv d7d5'
    expect(parseInfoLine(line)).toEqual({
      depth: 10,
      cp: -120,
      pv: ['d7d5'],
    })
  })

  it('handles lines without pv', () => {
    const line = 'info depth 1 score cp 0'
    expect(parseInfoLine(line)).toEqual({ depth: 1, cp: 0 })
  })

  it('ignores fields we do not care about (nodes, nps, time)', () => {
    const line = 'info depth 4 seldepth 6 nodes 999 nps 1000 time 100 score cp 50 pv e2e4'
    expect(parseInfoLine(line)).toEqual({ depth: 4, cp: 50, pv: ['e2e4'] })
  })
})
