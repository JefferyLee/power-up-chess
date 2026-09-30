// awardCastlePoints — the client-claimed award path. Every amount is
// clamped by AWARD_CAPS and then by the per-source daily bucket, so
// these tests pin both ceilings plus ownership, the audit row and the
// once-per-gameId dedupe.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { awardCastlePoints } from './awardCastlePoints'
import { AWARD_CAPS, type AwardSource } from './types'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const TODAY = Math.floor(NOW / DAY_MS)
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100 }
const bucket = (over: Partial<Record<'puzzle' | 'chessWin' | 'chessReview' | 'mystery', number>>, dayKey = TODAY) =>
  ({ dayKey, puzzle: 0, chessWin: 0, chessReview: 0, mystery: 0, ...over })
const award = (uid: string | null, a: AwardSource, name = 'ada') =>
  awardCastlePoints.run(callReq(uid, { normalizedName: name, award: a }))
const puzzle = (scorePoints: number, isFirstSolve = false): AwardSource =>
  ({ source: 'puzzle', puzzleId: 'p1', scorePoints, isFirstSolve })
const win = (gameId: string): AwardSource => ({ source: 'chess-win', gameId, opponent: 'human' })

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects signed-out, malformed and non-owner calls without writing', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(award(null, puzzle(20)))).toBe('unauthenticated')
    expect(await codeOf(award('uid-ada', puzzle(20), ''))).toBe('invalid-argument')
    expect(await codeOf(awardCastlePoints.run(callReq('uid-ada', { normalizedName: 'ada', award: 'lots' } as never)))).toBe('invalid-argument')
    expect(await codeOf(award('uid-eve', puzzle(20)))).toBe('permission-denied')
    expect(await codeOf(award('uid-ada', puzzle(20), 'ghost'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('rejects a gameId that is empty or not a single path segment', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(award('uid-ada', win('')))).toBe('invalid-argument')
    expect(await codeOf(award('uid-ada', win('a/b')))).toBe('invalid-argument')
    expect(db.writes).toEqual([])
  })
})

describe('per-award clamps', () => {
  it('puzzle: scorePoints clamped to puzzleMin..puzzleMax, first-solve bonus on top', async () => {
    useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', puzzle(9_999))).added).toBe(AWARD_CAPS.puzzleMax)
    expect((await award('uid-ada', puzzle(1))).added).toBe(AWARD_CAPS.puzzleMin)
    expect((await award('uid-ada', puzzle(9_999, true))).added).toBe(AWARD_CAPS.puzzleMax + AWARD_CAPS.puzzleFirstSolveBonus)
  })

  it('chess-win: pays the opponent tier, legacy flat rate when the tier is missing or unknown', async () => {
    useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', { source: 'chess-win', gameId: 'g1', opponent: 'ai-expert' })).added).toBe(40)
    expect((await award('uid-ada', { source: 'chess-win', gameId: 'g2' })).added).toBe(AWARD_CAPS.chessWin)
    expect((await award('uid-ada', { source: 'chess-win', gameId: 'g3', opponent: 'ai-godlike' as never })).added).toBe(AWARD_CAPS.chessWin)
  })

  it('chess-review: 8/brilliant + 1/best-excellent, capped at chessReviewMax', async () => {
    useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', { source: 'chess-review', gameId: 'g1', brilliant: 3, bestExcellent: 10 })).added).toBe(34)
    // Second review the same day: 80 capped by the remaining daily headroom (100 - 34).
    expect((await award('uid-ada', { source: 'chess-review', gameId: 'g2', brilliant: 999, bestExcellent: 999 })).added).toBe(AWARD_CAPS.chessReviewDailyMax - 34)
    const fresh = useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', { source: 'chess-review', gameId: 'g2', brilliant: 999, bestExcellent: 999 })).added).toBe(AWARD_CAPS.chessReviewMax)
    expect(fresh.get('guests/ada')?.castlePoints).toBe(100 + AWARD_CAPS.chessReviewMax)
  })

  it('a zero-value award still requires ownership, then returns the balance without writing', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    const zero: AwardSource = { source: 'chess-review', gameId: 'g1', brilliant: 0, bestExcellent: 0 }
    expect(await codeOf(award('uid-eve', zero))).toBe('permission-denied')
    expect(await codeOf(award('uid-ada', zero, 'ghost'))).toBe('failed-precondition')
    expect(await award('uid-ada', zero)).toEqual({ castlePoints: 100, added: 0, unlockedJustNow: false })
    expect(db.writes).toEqual([])
  })
})

describe('daily caps', () => {
  it('pays only the headroom left in the bucket, then nothing', async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, dailyEarn: bucket({ puzzle: AWARD_CAPS.puzzleDailyMax - 10 }) } })
    expect(await award('uid-ada', puzzle(25))).toEqual({ castlePoints: 110, added: 10, unlockedJustNow: false })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 110, dailyEarn: { puzzle: AWARD_CAPS.puzzleDailyMax } })

    const before = db.writes.length
    expect(await award('uid-ada', puzzle(25))).toEqual({ castlePoints: 110, added: 0, unlockedJustNow: false })
    expect(db.writes.length).toBe(before)
    expect(db.audits()).toHaveLength(1)
  })

  it('mystery pays 5 once a day — the second claim is capped to 0', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', { source: 'mystery', mysteryId: 'm1' })).added).toBe(AWARD_CAPS.mysteryReward)
    expect((await award('uid-ada', { source: 'mystery', mysteryId: 'm2' })).added).toBe(0)
    expect(db.get('guests/ada')?.castlePoints).toBe(105)
  })

  it("a stale bucket from yesterday is replaced, so today's award is paid in full", async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, dailyEarn: bucket({ chessWin: AWARD_CAPS.chessWinDailyMax }, TODAY - 1) } })
    expect((await award('uid-ada', { source: 'chess-win', gameId: 'g1', opponent: 'human' })).added).toBe(40)
    expect(db.get('guests/ada')?.dailyEarn).toEqual(bucket({ chessWin: 40 }))
  })

  it('rolls the bucket over even when the award itself is capped to 0', async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, dailyEarn: bucket({ puzzle: 5 }, TODAY - 1) } })
    // 0-valued chess-review takes the early-return path; use a capped mystery instead.
    await award('uid-ada', { source: 'mystery', mysteryId: 'm1' })
    expect(db.get('guests/ada')?.dailyEarn).toEqual(bucket({ mystery: 5 }))
  })
})

describe('ledger', () => {
  it('updates balance + lifetimeEarned, flags the 200-point unlock and appends the audit row', async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, castlePoints: 190 } })
    expect(await award('uid-ada', { source: 'chess-win', gameId: 'g1', opponent: 'ai-medium' })).toEqual({ castlePoints: 205, added: 15, unlockedJustNow: true })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 205, lifetimeEarned: 205, dailyEarn: bucket({ chessWin: 15 }) })
    expect(db.audits()).toEqual([{
      normalizedName: 'ada', uid: 'uid-ada', delta: 15, before: 190, after: 205,
      source: 'award:chess-win:ai-medium', metadata: { gameId: 'g1' }, serverTs: NOW,
    }])
  })

})

describe('idempotency', () => {
  it('pays a gameId once: the repeat returns the balance with added 0 and writes nothing', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await award('uid-ada', win('g1'))).toEqual({ castlePoints: 140, added: 40, unlockedJustNow: false })
    expect(db.get('castle_point_awards/ada_chess-win_g1')).toEqual({ normalizedName: 'ada', source: 'chess-win', delta: 40, serverTs: NOW })

    const before = db.writes.length
    expect(await award('uid-ada', win('g1'))).toEqual({ castlePoints: 140, added: 0, unlockedJustNow: false })
    expect(db.writes.length).toBe(before)
    expect(db.audits()).toHaveLength(1)
  })

  it('different games both pay, and the daily cap still clamps the third', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', win('g1'))).added).toBe(40)
    expect((await award('uid-ada', win('g2'))).added).toBe(40)
    expect((await award('uid-ada', win('g3'))).added).toBe(0)
    expect(db.get('guests/ada')?.castlePoints).toBe(100 + AWARD_CAPS.chessWinDailyMax)
    // A capped-to-0 game is not marked paid, so nothing was written for it.
    expect(db.get('castle_point_awards/ada_chess-win_g3')).toBeUndefined()
  })

  it('keys on (name, source, gameId): a review of the same game is a separate event', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    await award('uid-ada', win('g1'))
    expect((await award('uid-ada', { source: 'chess-review', gameId: 'g1', brilliant: 1, bestExcellent: 0 })).added).toBe(AWARD_CAPS.chessBrilliantEach)
    expect(db.get('castle_point_awards/ada_chess-review_g1')).toBeDefined()
  })

  it('puzzle and mystery are not event-keyed: the same puzzleId pays again, bounded by the cap', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect((await award('uid-ada', puzzle(20))).added).toBe(20)
    expect((await award('uid-ada', puzzle(20))).added).toBe(20)
    expect(db.writes.some((w) => w.path.startsWith('castle_point_awards/'))).toBe(false)
  })
})
