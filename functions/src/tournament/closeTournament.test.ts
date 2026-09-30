// closeTournament — the one tournament handler that moves castle points:
// +100 and a week-long crown to the top scorer. Covers who may close,
// when, the tiebreak, idempotency and the audit row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { closeTournament } from './closeTournament'
import { TOURNAMENT_CROWN_MS, TOURNAMENT_WINNER_REWARD_PTS } from './types'
import { tournamentWeekKey } from './weekKey'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const WEEK = tournamentWeekKey(NOW)
const PATH = `tournaments/${WEEK}`
const guest = (name: string, extra: Record<string, unknown> = {}) => ({
  displayName: name[0]!.toUpperCase() + name.slice(1), normalizedName: name, uids: [`uid-${name}`], castlePoints: 100, activeSessionId: 'sess', ...extra,
})
const participants = [
  { normalizedName: 'ada', displayName: 'Ada', registeredAt: 1 },
  { normalizedName: 'bob', displayName: 'Bob', registeredAt: 2 },
]
const round = (result: string | undefined) => ({ index: 0, startedAt: 1, pairings: [{ index: 0, white: 'ada', black: 'bob', ...(result ? { result } : {}) }] })
const tournament = (result: string | undefined, extra: Record<string, unknown> = {}) => ({
  weekKey: WEEK, status: 'active', openedAt: 1, closesAt: 2, participants, rounds: [round(result)], ...extra,
})
const base = { 'guests/ada': guest('ada'), 'guests/bob': guest('bob', { lifetimeEarned: 400 }) }
const close = (uid: string | null, name = 'ada', sessionId = 'sess') =>
  closeTournament.run(callReq(uid, { normalizedName: name, sessionId }, { ip: '203.0.113.7' }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects signed-out, non-owner and stale-session callers', async () => {
    const db = useFakeDb({ ...base, [PATH]: tournament('white-wins') })
    expect(await codeOf(close(null))).toBe('unauthenticated')
    expect(await codeOf(close('uid-eve'))).toBe('permission-denied')
    expect(await codeOf(close('uid-ada', 'ada', 'stale'))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('only a registered participant may close; needs a fully reported round', async () => {
    const db = useFakeDb({ ...base, 'guests/cat': guest('cat'), [PATH]: tournament('white-wins') })
    expect(await codeOf(close('uid-cat', 'cat'))).toBe('permission-denied')
    useFakeDb({ ...base, [PATH]: tournament(undefined) })
    expect(await codeOf(close('uid-ada'))).toBe('failed-precondition')
    useFakeDb({ ...base, [PATH]: tournament(undefined, { rounds: [] }) })
    expect(await codeOf(close('uid-ada'))).toBe('failed-precondition')
    useFakeDb(base)
    expect(await codeOf(close('uid-ada'))).toBe('not-found')
    expect(db.writes).toEqual([])
  })

  it('closing an already-closed tournament pays nothing again', async () => {
    const db = useFakeDb({ ...base, [PATH]: tournament('white-wins', { status: 'closed', winnerName: 'Ada', closedAt: 5 }) })
    expect(await close('uid-ada')).toMatchObject({ ok: true, winnerName: 'Ada' })
    expect(db.writes).toEqual([])
    expect(db.get('guests/ada')?.castlePoints).toBe(100)
  })
})

describe('payout', () => {
  it('pays the winner (not the closer): +100, lifetimeEarned, crown, champion snapshot, audit row', async () => {
    const db = useFakeDb({ ...base, [PATH]: tournament('black-wins') })
    const r = await close('uid-ada')
    expect(r).toMatchObject({ ok: true, winnerName: 'Bob', tournament: { status: 'closed', closedAt: NOW, winnerName: 'Bob' } })
    expect(r).not.toHaveProperty('yourCastlePoints')
    expect(db.get(PATH)).toMatchObject({ status: 'closed', closedAt: NOW, winnerName: 'Bob' })
    expect(db.get('guests/bob')).toMatchObject({
      castlePoints: 100 + TOURNAMENT_WINNER_REWARD_PTS, lifetimeEarned: 400 + TOURNAMENT_WINNER_REWARD_PTS,
      cosmetics: { tournamentCrownExpiresAt: NOW + TOURNAMENT_CROWN_MS },
    })
    expect(db.get('guests/ada')?.castlePoints).toBe(100)
    expect(db.get('castle_live/current_champion')).toEqual({ normalizedName: 'bob', displayName: 'Bob', weekKey: WEEK, closedAt: NOW, championUntil: NOW + TOURNAMENT_CROWN_MS })
    expect(db.audits()).toEqual([expect.objectContaining({
      normalizedName: 'bob', uid: 'uid-ada', delta: TOURNAMENT_WINNER_REWARD_PTS, before: 100, after: 200,
      source: 'tournament:winner', metadata: { weekKey: WEEK, closedBy: 'ada' }, serverTs: NOW,
    })])
    expect(JSON.stringify(db.audits())).not.toContain('203.0.113.7')
  })

  it('when the closer wins, the response carries their new balance and lifetimeEarned is seeded', async () => {
    const db = useFakeDb({ ...base, [PATH]: tournament('white-wins') })
    expect(await close('uid-ada')).toMatchObject({ winnerName: 'Ada', yourCastlePoints: 200 })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 200, lifetimeEarned: 200 })
  })

  it('a draw goes to the earliest registration', async () => {
    const db = useFakeDb({ ...base, [PATH]: tournament('draw') })
    expect((await close('uid-bob', 'bob')).winnerName).toBe('Ada')
    expect(db.get('guests/ada')?.castlePoints).toBe(200)
    expect(db.get('guests/bob')?.castlePoints).toBe(100)
  })
})
