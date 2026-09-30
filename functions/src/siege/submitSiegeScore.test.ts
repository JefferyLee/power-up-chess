// submitSiegeScore — leaderboard publish for the Siege. No castle
// points move here, but the doc is public, so the guards matter:
// ownership, input clamps, and best-only writes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { submitSiegeScore } from './submitSiegeScore'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 0 }
const run = (uid: string | null, data: Record<string, unknown>) =>
  submitSiegeScore.run(callReq(uid, { normalizedName: 'ada', ...data } as never))

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects a signed-out caller before touching the db', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run(null, { mode: 'endless', score: 1, wave: 1 }))).toBe('unauthenticated')
    expect(db.writes).toEqual([])
  })

  it('rejects a caller whose uid is not on the guest doc', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run('uid-eve', { mode: 'endless', score: 1, wave: 1 }))).toBe('permission-denied')
    expect(db.writes).toEqual([])
  })

  it('rejects a name with no guest doc (bypass guests never publish)', async () => {
    const db = useFakeDb({})
    expect(await codeOf(run('uid-ada', { mode: 'endless', score: 1, wave: 1 }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('rejects a bad mode, non-numeric score/wave, malformed dateKey and missing stars', async () => {
    useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run('uid-ada', { mode: 'arcade', score: 1, wave: 1 }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'endless', score: 'lots', wave: 1 }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'endless', score: 1, wave: Infinity }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'daily', score: 1, wave: 1 }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'daily', score: 1, wave: 1, dateKey: '2026-9-1' }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'daily', score: 1, wave: 1, dateKey: '2026-09-01T00' }))).toBe('invalid-argument')
    expect(await codeOf(run('uid-ada', { mode: 'campaign', score: 1, wave: 1 }))).toBe('invalid-argument')
  })
})

describe('clamps', () => {
  it('floors and caps score / wave / stars and never stores negatives', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    await run('uid-ada', { mode: 'endless', score: 5_000_000.9, wave: 1e9 })
    expect(db.get('siege_scores/ada')?.endlessBest).toEqual({ score: 1_000_000, wave: 999 })

    await run('uid-ada', { mode: 'campaign', score: -5, wave: -1, stars: 99 })
    expect(db.get('siege_scores/ada')?.campaignStars).toBe(36)

    const fresh = useFakeDb({ 'guests/ada': ada })
    await run('uid-ada', { mode: 'endless', score: -5.5, wave: -1 })
    expect(fresh.get('siege_scores/ada')?.endlessBest).toEqual({ score: 0, wave: 0 })
  })
})

describe('best-only writes', () => {
  const prior = {
    normalizedName: 'ada',
    displayName: 'Old Name',
    endlessBest: { score: 500, wave: 5 },
    dailyBest: { dateKey: '2026-09-28', score: 900, wave: 9 },
    campaignStars: 10,
    updatedAt: 1,
  }

  it('endless: no write when not improved, merge-set when improved', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'siege_scores/ada': prior })
    expect(await run('uid-ada', { mode: 'endless', score: 500, wave: 50 })).toEqual({ ok: true, improved: false })
    expect(db.writes).toEqual([])

    expect(await run('uid-ada', { mode: 'endless', score: 600, wave: 6 })).toEqual({ ok: true, improved: true })
    expect(db.writes).toEqual([{
      op: 'set',
      path: 'siege_scores/ada',
      merge: true,
      data: { normalizedName: 'ada', displayName: 'Ada', endlessBest: { score: 600, wave: 6 }, updatedAt: NOW },
    }])
    // Merge keeps the other modes' bests; displayName comes from the guest doc.
    expect(db.get('siege_scores/ada')).toMatchObject({ dailyBest: prior.dailyBest, campaignStars: 10, displayName: 'Ada' })
  })

  it('daily: same day only on improvement, a new day always replaces', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'siege_scores/ada': prior })
    expect((await run('uid-ada', { mode: 'daily', score: 800, wave: 8, dateKey: '2026-09-28' })).improved).toBe(false)
    expect(db.writes).toEqual([])

    expect((await run('uid-ada', { mode: 'daily', score: 950, wave: 9, dateKey: '2026-09-28' })).improved).toBe(true)
    expect(db.get('siege_scores/ada')?.dailyBest).toEqual({ dateKey: '2026-09-28', score: 950, wave: 9 })

    expect((await run('uid-ada', { mode: 'daily', score: 100, wave: 1, dateKey: '2026-09-29' })).improved).toBe(true)
    expect(db.get('siege_scores/ada')?.dailyBest).toEqual({ dateKey: '2026-09-29', score: 100, wave: 1 })
  })

  it('campaign: stars only ever go up', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'siege_scores/ada': prior })
    expect((await run('uid-ada', { mode: 'campaign', score: 0, wave: 0, stars: 10 })).improved).toBe(false)
    expect((await run('uid-ada', { mode: 'campaign', score: 0, wave: 0, stars: 9 })).improved).toBe(false)
    expect(db.writes).toEqual([])
    expect((await run('uid-ada', { mode: 'campaign', score: 0, wave: 0, stars: 12 })).improved).toBe(true)
    expect(db.get('siege_scores/ada')?.campaignStars).toBe(12)
  })
})
