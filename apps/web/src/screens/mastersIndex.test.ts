// Integrity check for the shipped master-games index (built by
// tools/games-import/import.mjs). The importer validates every game
// through chess.js at build time; this guards the SHAPE of what ships
// and re-checks the 5 hand-curated classics (cheap) so a broken bundle
// fails CI rather than the kid's screen.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'

const INDEX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/master-games/index.json',
)

describe('master-games index', () => {
  if (!existsSync(INDEX)) {
    it.skip('index.json present (run tools/games-import/import.mjs to generate)', () => {})
    return
  }

  const data = JSON.parse(readFileSync(INDEX, 'utf8')) as {
    version: number
    shardSize: number
    players: string[]
    events: string[]
    classics: Array<{ id: string; pgn: string; plies: number; hostId: string; blurb: string; white: string; black: string }>
    games: Array<[string, number, number, number, number, number, string, number]>
  }

  it('has the expected top-level shape', () => {
    expect(data.version).toBe(2)
    expect(data.shardSize).toBeGreaterThan(0)
    expect(Array.isArray(data.players)).toBe(true)
    expect(Array.isArray(data.events)).toBe(true)
    expect(data.games.length).toBeGreaterThan(0)
  })

  it('every classic parses and has a blurb + valid host', () => {
    expect(data.classics.length).toBe(5)
    for (const c of data.classics) {
      const chess = new Chess()
      expect(() => chess.loadPgn(c.pgn)).not.toThrow()
      expect(chess.history()).toHaveLength(c.plies)
      expect(c.blurb.length).toBeGreaterThan(0)
      expect(['lucy', 'luca']).toContain(c.hostId)
    }
  })

  it('master rows resolve against the dictionaries and have unique ids', () => {
    const ids = new Set<string>()
    for (const g of data.games) {
      const [id, wIdx, bIdx, evIdx, , rCode] = g
      expect(ids.has(id)).toBe(false)
      ids.add(id)
      expect(data.players[wIdx]).toBeTypeOf('string')
      expect(data.players[bIdx]).toBeTypeOf('string')
      expect(data.events[evIdx]).toBeTypeOf('string')
      expect(rCode).toBeGreaterThanOrEqual(0)
      expect(rCode).toBeLessThanOrEqual(2)
    }
  })
})
