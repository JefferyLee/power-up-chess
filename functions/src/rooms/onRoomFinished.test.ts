// onRoomFinished — the online win is paid here (2026-10-12): 40 points
// for the winner, once per room, even when the loser is a bypass guest.
// The archive write is mocked; the rating transaction is the real one.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFakeDb } from '../../test/fakeDb'
import { onRoomFinished } from './onRoomFinished'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)
vi.mock('./playerGames', () => ({ archiveFinishedGame: vi.fn(async () => undefined) }))

const NOW = 1_800_000_000_000
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100 }
const bob = { displayName: 'Bob', normalizedName: 'bob', uids: ['uid-bob'], castlePoints: 50 }
const room = (over: Record<string, unknown>) => ({
  status: 'completed', result: 'white', white: { displayName: 'Ada', uid: 'uid-ada' }, black: { displayName: 'Bob', uid: 'uid-bob' }, ...over,
})
const fire = (before: Record<string, unknown>, after: Record<string, unknown>, roomId = 'r1') =>
  onRoomFinished.run({ data: { before: { data: () => before }, after: { data: () => after } }, params: { roomId } } as never)

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('onRoomFinished settlement', () => {
  it('pays the winner 40 once, with a server-initiated audit row, alongside the rating update', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'guests/bob': bob })
    await fire(room({ status: 'playing', result: undefined }), room({}))
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 140, lifetimeEarned: 140, chessGames: 1 })
    expect(db.get('guests/bob')).toMatchObject({ castlePoints: 50, chessGames: 1 })
    expect(db.get('castle_point_awards/ada_chess-win_r1')).toMatchObject({ source: 'chess-win', delta: 40 })
    expect(db.audits()).toEqual([expect.objectContaining({ normalizedName: 'ada', uid: null, delta: 40, source: 'award:chess-win:human', metadata: { gameId: 'r1' } })])

    // A second update of an already-completed room is ignored.
    await fire(room({}), room({ touched: true }))
    expect(db.get('guests/ada')?.castlePoints).toBe(140)
    expect(db.audits()).toHaveLength(1)
  })

  it('pays black when black wins, nobody on a draw', async () => {
    const db = useFakeDb({ 'guests/ada': ada, 'guests/bob': bob })
    await fire(room({ status: 'playing', result: undefined }), room({ result: 'black' }))
    expect(db.get('guests/bob')?.castlePoints).toBe(90)
    expect(db.get('guests/ada')?.castlePoints).toBe(100)
    const fresh = useFakeDb({ 'guests/ada': ada, 'guests/bob': bob })
    await fire(room({ status: 'playing', result: undefined }), room({ result: 'draw' }))
    expect(fresh.audits()).toEqual([])
  })

  it('still pays the winner when the loser is a bypass guest (no rating for either)', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    await fire(room({ status: 'playing', result: undefined }), room({ black: { displayName: 'Guest', uid: 'uid-x' } }))
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 140 })
    expect(db.get('guests/ada')?.chessGames).toBeUndefined()
  })
})
