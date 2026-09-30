// awardTutorialComplete — one-time +50 for finishing the basics
// tutorial. learnedBasicsAt is the idempotency key.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { awardTutorialComplete } from './awardTutorialComplete'
import { TUTORIAL_COMPLETE_REWARD } from './types'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100, lifetimeEarned: 300 }
const run = (uid: string | null, normalizedName = 'ada') =>
  awardTutorialComplete.run(callReq(uid, { normalizedName }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('awardTutorialComplete', () => {
  it('rejects signed-out and non-owner callers; a doc-less name is failed-precondition', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(run(null))).toBe('unauthenticated')
    expect(await codeOf(run('uid-eve'))).toBe('permission-denied')
    expect(await codeOf(run('uid-ada', 'ghost'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('is a no-op for a bypass guest (empty name)', async () => {
    const db = useFakeDb({})
    expect(await run('uid-x', '')).toEqual({ ok: true, added: 0, castlePoints: 0, alreadyClaimed: false })
    expect(db.writes).toEqual([])
  })

  it('pays the reward once, stamps learnedBasicsAt and appends the audit row', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await run('uid-ada')).toEqual({ ok: true, added: TUTORIAL_COMPLETE_REWARD, castlePoints: 150, alreadyClaimed: false })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 150, lifetimeEarned: 350, learnedBasicsAt: NOW, lastVisitAt: NOW })
    expect(db.audits()).toEqual([{
      normalizedName: 'ada', uid: 'uid-ada', delta: 50, before: 100, after: 150, source: 'tutorial:complete', serverTs: NOW,
    }])

    // Second call: already claimed, nothing moves.
    expect(await run('uid-ada')).toEqual({ ok: true, added: 0, castlePoints: 150, alreadyClaimed: true })
    expect(db.get('guests/ada')?.castlePoints).toBe(150)
    expect(db.audits()).toHaveLength(1)
  })

  it('treats a pre-existing learnedBasicsAt as claimed, whatever its value', async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, learnedBasicsAt: 0 } })
    expect((await run('uid-ada')).alreadyClaimed).toBe(true)
    expect(db.writes).toEqual([])
  })
})
