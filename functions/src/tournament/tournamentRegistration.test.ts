// registerForTournament / unregisterFromTournament — entry gate,
// session binding, lazy doc creation, idempotency, and the
// registration-only window for pulling out. Neither moves castle
// points: entry is gated on puzzle solves, not paid.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { registerForTournament } from './registerForTournament'
import { TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES, TOURNAMENT_ENTRY_WEEKLY_SOLVES, TOURNAMENT_WEEK_MS } from './types'
import { unregisterFromTournament } from './unregisterFromTournament'
import { tournamentWeekKey } from './weekKey'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const WEEK = tournamentWeekKey(NOW)
const PATH = `tournaments/${WEEK}`
const ada = {
  displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 0, activeSessionId: 'sess-1',
  puzzleStats: { solved: TOURNAMENT_ENTRY_MIN_LIFETIME_SOLVES, attempted: 9 },
}
const open = { weekKey: WEEK, status: 'registration', openedAt: 1, closesAt: 1 + TOURNAMENT_WEEK_MS, participants: [] as unknown[], rounds: [] }
const bobEntry = { normalizedName: 'bob', displayName: 'Bob', registeredAt: 5 }
const adaEntry = { normalizedName: 'ada', displayName: 'Ada', registeredAt: NOW }
const register = (uid: string | null, data: Record<string, unknown> = {}) =>
  registerForTournament.run(callReq(uid, { normalizedName: 'ada', sessionId: 'sess-1', ...data } as never))
const unregister = (uid: string | null, data: Record<string, unknown> = {}) =>
  unregisterFromTournament.run(callReq(uid, { normalizedName: 'ada', sessionId: 'sess-1', ...data } as never))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('registerForTournament', () => {
  it('rejects signed-out, non-owner and stale-session callers without writing', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(register(null))).toBe('unauthenticated')
    expect(await codeOf(register('uid-eve'))).toBe('permission-denied')
    expect(await codeOf(register('uid-ada', { sessionId: 'sess-old' }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('entry gate: 50 solves this week OR 5 lifetime; a stale weekly counter does not count', async () => {
    const db = useFakeDb({ 'guests/ada': { ...ada, puzzleStats: { solved: 4, attempted: 9 } } })
    expect(await codeOf(register('uid-ada'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])

    useFakeDb({ 'guests/ada': { ...ada, puzzleStats: { solved: 0, attempted: 0 }, puzzleSolvesThisWeek: { weekKey: '2000-W01', count: TOURNAMENT_ENTRY_WEEKLY_SOLVES } } })
    expect(await codeOf(register('uid-ada'))).toBe('failed-precondition')

    useFakeDb({ 'guests/ada': { ...ada, puzzleStats: { solved: 0, attempted: 0 }, puzzleSolvesThisWeek: { weekKey: WEEK, count: TOURNAMENT_ENTRY_WEEKLY_SOLVES } } })
    expect(await codeOf(register('uid-ada'))).toBe('ok')
  })

  it("lazily creates this week's doc and appends the server-bound display name", async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    const r = await register('uid-ada')
    expect(r.alreadyRegistered).toBe(false)
    expect(db.get(PATH)).toEqual({ ...open, openedAt: NOW, closesAt: NOW + TOURNAMENT_WEEK_MS, participants: [adaEntry] })
  })

  it('appends to an existing list, and re-registering is an idempotent no-op', async () => {
    const db = useFakeDb({ 'guests/ada': ada, [PATH]: { ...open, participants: [bobEntry] } })
    expect((await register('uid-ada')).alreadyRegistered).toBe(false)
    expect(db.get(PATH)?.participants).toEqual([bobEntry, adaEntry])
    const before = db.writes.length
    expect((await register('uid-ada')).alreadyRegistered).toBe(true)
    expect(db.writes.length).toBe(before)
  })

  it('refuses once the tournament has left registration', async () => {
    const db = useFakeDb({ 'guests/ada': ada, [PATH]: { ...open, status: 'active' } })
    expect(await codeOf(register('uid-ada'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })
})

describe('unregisterFromTournament', () => {
  it('rejects signed-out, non-owner and stale-session callers; not-found without a tournament', async () => {
    const db = useFakeDb({ 'guests/ada': ada, [PATH]: { ...open, participants: [adaEntry] } })
    expect(await codeOf(unregister(null))).toBe('unauthenticated')
    expect(await codeOf(unregister('uid-eve'))).toBe('permission-denied')
    expect(await codeOf(unregister('uid-ada', { sessionId: 'nope' }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
    useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(unregister('uid-ada'))).toBe('not-found')
  })

  it('drops the caller during registration; is idempotent when they were not listed', async () => {
    const db = useFakeDb({ 'guests/ada': ada, [PATH]: { ...open, participants: [bobEntry, adaEntry] } })
    expect((await unregister('uid-ada')).wasNotRegistered).toBe(false)
    expect(db.get(PATH)?.participants).toEqual([bobEntry])
    const before = db.writes.length
    expect((await unregister('uid-ada')).wasNotRegistered).toBe(true)
    expect(db.writes.length).toBe(before)
  })

  it('refuses once round 1 has been paired', async () => {
    const db = useFakeDb({ 'guests/ada': ada, [PATH]: { ...open, status: 'active', participants: [adaEntry] } })
    expect(await codeOf(unregister('uid-ada'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })
})
