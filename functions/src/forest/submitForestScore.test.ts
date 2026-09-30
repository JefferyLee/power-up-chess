// submitForestScore — leaderboard + castle-point payout for a Forest
// run. Covers ownership, the 0..200 clamp, best-only rows, the
// hideFromLeaderboards opt-out, the forestDailyMax cap and the audit row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { AWARD_CAPS } from '../castle/types'
import { hashIp } from '../castle/ipGeo'
import { submitForestScore } from './submitForestScore'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const TODAY = Math.floor(NOW / DAY_MS)
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100 }
const run = (uid: string | null, score: number, extra: Record<string, unknown> = {}, ip?: string) =>
  submitForestScore.run(callReq(uid, { normalizedName: 'ada', runId: 'run-1', score, ...extra } as never, { ip }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects signed-out, non-owner and doc-less callers without writing', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run(null, 50))).toBe('unauthenticated')
    expect(await codeOf(run('uid-eve', 50))).toBe('permission-denied')
    expect(await codeOf(submitForestScore.run(callReq('uid-x', { normalizedName: 'ghost', runId: 'r', score: 50 })))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('rejects a missing runId or a non-numeric score', async () => {
    useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run('uid-ada', 50, { runId: '' }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', NaN))).toBe('invalid-argument')
  })
})

describe('score clamp and payout tiers', () => {
  it('clamps the score to 0..200 before it reaches the run doc, the board or the payout', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    const r = await run('uid-ada', 999.7)
    expect(r).toMatchObject({ ok: true, best: 200, improved: true, castlePointsAdded: 30, castlePoints: 130 })
    expect(db.get('forest_runs/uid-ada/runs/run-1')).toEqual({ runId: 'run-1', score: 200, finishedAt: NOW, uid: 'uid-ada', displayName: 'Ada' })
    expect(db.get('forest_leaderboard/ada')?.best).toBe(200)

    const low = useFakeDb({ 'guests/ada': ada })
    expect(await run('uid-ada', -40)).toMatchObject({ best: 0, improved: false, castlePointsAdded: 0, castlePoints: 100 })
    expect(low.get('forest_runs/uid-ada/runs/run-1')?.score).toBe(0)
  })

  it('pays the highest tier whose minScore the run meets', async () => {
    for (const [score, pt] of [[19, 0], [20, 5], [50, 10], [89, 10], [90, 18], [140, 30]] as const) {
      useFakeDb({ 'guests/ada': ada })
      expect((await run('uid-ada', score)).castlePointsAdded).toBe(pt)
    }
  })
})

describe('leaderboard row', () => {
  const row = { normalizedName: 'ada', displayName: 'Ada', best: 120, updatedAt: 1 }

  it('is written only when the run beats the stored best', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'forest_leaderboard/ada': row })
    expect(await run('uid-ada', 100)).toMatchObject({ best: 120, improved: false })
    expect(db.writes.some((w) => w.path === 'forest_leaderboard/ada')).toBe(false)

    expect(await run('uid-ada', 150, { runId: 'run-2' })).toMatchObject({ best: 150, improved: true })
    expect(db.get('forest_leaderboard/ada')).toEqual({ normalizedName: 'ada', displayName: 'Ada', best: 150, updatedAt: NOW })
  })

  it('hideFromLeaderboards skips the row, deletes a stale one, and still pays the points', async () => {
    const hidden = { ...ada, hideFromLeaderboards: true }
    const db = useFakeDb({ 'guests/ada': hidden })
    expect(await run('uid-ada', 150)).toMatchObject({ improved: true, castlePointsAdded: 30 })
    expect(db.get('forest_leaderboard/ada')).toBeUndefined()

    const stale = useFakeDb({ 'guests/ada': hidden, 'forest_leaderboard/ada': row })
    await run('uid-ada', 10)
    expect(stale.get('forest_leaderboard/ada')).toBeUndefined()
    expect(stale.writes).toContainEqual({ op: 'delete', path: 'forest_leaderboard/ada' })
  })
})

describe('castle points', () => {
  it('credits the guest, seeds lifetimeEarned and appends an audit row with the IP hashed', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    await run('uid-ada', 60, {}, '203.0.113.7')
    expect(db.get('guests/ada')).toMatchObject({
      castlePoints: 110,
      lifetimeEarned: 110,
      dailyEarn: { dayKey: TODAY, forest: 10 },
    })
    expect(db.audits()).toEqual([{
      normalizedName: 'ada',
      uid: 'uid-ada',
      delta: 10,
      before: 100,
      after: 110,
      source: 'forest:run',
      metadata: { runId: 'run-1', score: 60, improved: true },
      ipHash: hashIp('203.0.113.7'),
      serverTs: NOW,
    }])
    expect(JSON.stringify(db.audits())).not.toContain('203.0.113.7')
  })

  it('caps the day at forestDailyMax: partial headroom pays partially, none pays nothing', async () => {
    const db = useFakeDb({
      'guests/ada': { ...ada, lifetimeEarned: 500, dailyEarn: { dayKey: TODAY, puzzle: 0, chessWin: 0, chessReview: 0, forest: AWARD_CAPS.forestDailyMax - 5 } },
    })
    expect(await run('uid-ada', 150)).toMatchObject({ castlePointsAdded: 5, castlePoints: 105 })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 105, lifetimeEarned: 505, dailyEarn: { forest: AWARD_CAPS.forestDailyMax } })
    expect(db.audits()).toHaveLength(1)

    const before = db.writes.length
    expect(await run('uid-ada', 150, { runId: 'run-2' })).toMatchObject({ castlePointsAdded: 0, castlePoints: 105 })
    expect(db.get('guests/ada')?.castlePoints).toBe(105)
    expect(db.audits()).toHaveLength(1)
    // Only the run doc was written this time — no guest update, no audit.
    expect(db.writes.slice(before).map((w) => w.path)).toEqual(['forest_runs/uid-ada/runs/run-2'])
  })

  it("resets yesterday's bucket, so a new day gets the full tier again", async () => {
    const db = useFakeDb({
      'guests/ada': { ...ada, dailyEarn: { dayKey: TODAY - 1, puzzle: 0, chessWin: 0, chessReview: 0, forest: AWARD_CAPS.forestDailyMax } },
    })
    expect(await run('uid-ada', 150)).toMatchObject({ castlePointsAdded: 30, castlePoints: 130 })
    expect(db.get('guests/ada')?.dailyEarn).toEqual({ dayKey: TODAY, puzzle: 0, chessWin: 0, chessReview: 0, forest: 30 })
  })

  it('rolls the bucket over on a zero-payout run without touching the balance', async () => {
    const db = useFakeDb({
      'guests/ada': { ...ada, dailyEarn: { dayKey: TODAY - 1, puzzle: 7, chessWin: 0, chessReview: 0, forest: 30 } },
    })
    expect(await run('uid-ada', 5)).toMatchObject({ castlePointsAdded: 0, castlePoints: 100 })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 100, dailyEarn: { dayKey: TODAY, puzzle: 0, forest: 0 } })
    expect(db.audits()).toEqual([])
  })
})
