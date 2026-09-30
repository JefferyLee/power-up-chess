// submitPuzzleAttempt — per-plot ELO update + castle-point ledger for a
// puzzle attempt. Covers ownership, the bypass no-op, the rating maths
// (K = ELO_K, clamped to RATING_MIN..RATING_MAX), the three payout tiers
// and the Today's Five completion bonus.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { DAILY_BONUS_POINTS, laDayKey } from './dailyFive'
import { submitPuzzleAttempt } from './submitPuzzleAttempt'
import { DEFAULT_RATING, ELO_K, PUZZLE_POINTS, RATING_MAX, RATING_MIN } from './types'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const puzzle = (id: string, difficulty: number, legends = false) => ({
  id, fen: '8/8/8/8/8/8/8/8 w - - 0 1', sideToMove: 'w', solution: ['e2e4'], motifs: [], plot: 'fork',
  difficulty, ratingDeviation: 80, legends, source: { provider: 'lichess', puzzleId: id, license: 'CC0' },
})
const puzzles = {
  'puzzles/p1': puzzle('p1', 1000),
  'puzzles/easy': puzzle('easy', RATING_MIN),
  'puzzles/hard': puzzle('hard', RATING_MAX),
  'puzzles/m1': puzzle('m1', 2600),
  'puzzles/l1': puzzle('l1', 3100, true),
}
const ada = {
  displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100,
  puzzleRatings: { fork: 1000 }, puzzleStats: { solved: 3, attempted: 5 },
}
const attempt = (uid: string | null, puzzleId: string, success: boolean, normalizedName = 'ada') =>
  submitPuzzleAttempt.run(callReq(uid, { normalizedName, puzzleId, success }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects signed-out callers, a missing puzzleId and an unknown puzzle', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await codeOf(attempt(null, 'p1', true))).toBe('unauthenticated')
    expect(await codeOf(attempt('uid-ada', '', true))).toBe('invalid-argument')
    expect(await codeOf(attempt('uid-ada', 'nope', true))).toBe('not-found')
    expect(db.writes).toEqual([])
  })

  it('rejects a caller who does not own the name — no rating, no points', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await codeOf(attempt('uid-eve', 'p1', true))).toBe('permission-denied')
    expect(await codeOf(attempt('uid-ada', 'p1', true, 'ghost'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('bypass guest (empty name): coherent synthetic response, nothing persisted', async () => {
    const db = useFakeDb(puzzles)
    const r = await attempt('uid-x', 'p1', true, '')
    expect(r).toMatchObject({ ok: true, plot: 'fork', ratingBefore: DEFAULT_RATING, puzzleRating: 1000, castlePointsAdded: 0, castlePoints: 0 })
    expect(r.ratingAfter).toBeGreaterThan(DEFAULT_RATING)
    expect((await attempt('uid-x', 'p1', false, '')).ratingAfter).toBeLessThan(DEFAULT_RATING)
    expect(db.writes).toEqual([])
  })
})

describe('rating update', () => {
  it('moves by K/2 for an even match: up on a solve, down on a fail', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await attempt('uid-ada', 'p1', true)).toMatchObject({ ratingBefore: 1000, ratingAfter: 1000 + ELO_K / 2 })
    expect(db.get('guests/ada')?.puzzleRatings).toEqual({ fork: 1000 + ELO_K / 2 })

    const fresh = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await attempt('uid-ada', 'p1', false)).toMatchObject({ ratingBefore: 1000, ratingAfter: 1000 - ELO_K / 2 })
    expect(fresh.get('guests/ada')?.puzzleRatings).toEqual({ fork: 1000 - ELO_K / 2 })
  })

  it('starts an unrated plot at DEFAULT_RATING and clamps to RATING_MIN..RATING_MAX', async () => {
    useFakeDb({ ...puzzles, 'guests/ada': { ...ada, puzzleRatings: {} } })
    expect((await attempt('uid-ada', 'p1', true)).ratingBefore).toBe(DEFAULT_RATING)

    useFakeDb({ ...puzzles, 'guests/ada': { ...ada, puzzleRatings: { fork: RATING_MAX } } })
    expect((await attempt('uid-ada', 'easy', true)).ratingAfter).toBe(RATING_MAX)

    useFakeDb({ ...puzzles, 'guests/ada': { ...ada, puzzleRatings: { fork: RATING_MIN } } })
    expect((await attempt('uid-ada', 'hard', false)).ratingAfter).toBe(RATING_MIN)
  })
})

describe('castle points', () => {
  it('a solve pays the normal tier, credits the balance and appends an audit row', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await attempt('uid-ada', 'p1', true)).toMatchObject({ castlePointsAdded: PUZZLE_POINTS.normal, castlePoints: 105, dailyBonusAdded: 0 })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 105, lifetimeEarned: 5, puzzleStats: { solved: 4, attempted: 6 } })
    expect(db.audits()).toEqual([{
      normalizedName: 'ada', uid: 'uid-ada', delta: 5, before: 100, after: 105,
      source: 'puzzle:solve', metadata: { puzzleId: 'p1', success: true, plot: 'fork' }, serverTs: NOW,
    }])
  })

  it('a fail pays nothing and writes no audit row, but still counts the attempt', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect(await attempt('uid-ada', 'p1', false)).toMatchObject({ castlePointsAdded: 0, castlePoints: 100 })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 100, puzzleStats: { solved: 3, attempted: 6 } })
    expect(db.audits()).toEqual([])
  })

  it('pays by puzzle tier: master (>= 2500) and legends, and pins the legends badge once', async () => {
    const db = useFakeDb({ ...puzzles, 'guests/ada': ada })
    expect((await attempt('uid-ada', 'm1', true)).castlePointsAdded).toBe(PUZZLE_POINTS.master)
    expect((await attempt('uid-ada', 'l1', true)).castlePointsAdded).toBe(PUZZLE_POINTS.legends)
    expect((await attempt('uid-ada', 'l1', true)).castlePointsAdded).toBe(PUZZLE_POINTS.legends)
    expect(db.get('guests/ada')?.puzzleLegendsBadges).toEqual(['l1'])
    expect(db.get('guests/ada')?.castlePoints).toBe(100 + 25 + 50 + 50)
  })

  it("Today's Five: the fifth slot pays the completion bonus once, under the daily-bonus source", async () => {
    const daily = { dayKey: laDayKey(NOW), puzzleIds: ['a', 'b', 'c', 'd', 'p1'], results: [true, false, true, true, null] }
    const db = useFakeDb({ ...puzzles, 'guests/ada': { ...ada, puzzleDaily: daily } })
    expect(await attempt('uid-ada', 'p1', true)).toMatchObject({
      dailyCompletedNow: true, dailyBonusAdded: DAILY_BONUS_POINTS, castlePointsAdded: PUZZLE_POINTS.normal + DAILY_BONUS_POINTS,
    })
    expect(db.get('guests/ada')?.puzzleDaily).toEqual({ ...daily, results: [true, false, true, true, true], completionBonusPaid: true })
    expect(db.audits()[0]).toMatchObject({ source: 'puzzle:daily-bonus', delta: 15, metadata: { dailyBonusAdded: DAILY_BONUS_POINTS } })

    // Re-solving a slate puzzle pays the solve again but never the bonus.
    expect(await attempt('uid-ada', 'p1', true)).toMatchObject({ dailyCompletedNow: false, dailyBonusAdded: 0, castlePointsAdded: PUZZLE_POINTS.normal })
  })

  it("yesterday's slate is ignored", async () => {
    const daily = { dayKey: '2000-01-01', puzzleIds: ['a', 'b', 'c', 'd', 'p1'], results: [true, true, true, true, null] }
    const db = useFakeDb({ ...puzzles, 'guests/ada': { ...ada, puzzleDaily: daily } })
    expect(await attempt('uid-ada', 'p1', true)).toMatchObject({ dailyBonusAdded: 0 })
    expect(db.get('guests/ada')?.puzzleDaily).toEqual(daily)
  })
})
