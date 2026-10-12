// syncDeviceGame — since 2026-10-12 the Local / AI win is paid HERE, in
// the same transaction as the archive record, so a win claim must come
// with a game the PGN backs. These pin: the record, the settlement per
// tier, what is NOT paid (loss, fake checkmate), the legacy rate for an
// unknown tier, and the once-per-id replay.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { pgnSupportsWin, syncDeviceGame } from './syncDeviceGame'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)
vi.mock('../castle/chatRateLimit', () => ({ bumpAndCheck: async () => ({ allowed: true, retryAfterMs: 0 }) }))

const NOW = 1_800_000_000_000
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 100 }
const seed = { 'guests/ada': ada, 'chat_identity/uid-ada': { normalizedName: 'ada', isBypass: false } }
const WHITE_MATES = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#'
const BLACK_MATES = '1. f3 e5 2. g4 Qh4#'
const base = {
  playedAt: NOW - 1000, whiteName: 'Ada', blackName: 'Luca', hostId: 'luca' as const,
  endReason: 'checkmate', moveCount: 7,
}
const sync = (over: Record<string, unknown>) =>
  syncDeviceGame.run(callReq('uid-ada', { ...base, ...over }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('pgnSupportsWin', () => {
  it('needs a parseable game, and a claimed mate must be on the board with the loser to move', () => {
    expect(pgnSupportsWin(WHITE_MATES, 'white', 'checkmate')).toBe(true)
    expect(pgnSupportsWin(WHITE_MATES, 'black', 'checkmate')).toBe(false)
    expect(pgnSupportsWin(BLACK_MATES, 'black', 'checkmate')).toBe(true)
    expect(pgnSupportsWin('1. e4 e5', 'white', 'checkmate')).toBe(false)
    expect(pgnSupportsWin('1. e4 e5', 'white', 'resign')).toBe(true)
    expect(pgnSupportsWin('1. e4', 'white', 'resign')).toBe(false)
    expect(pgnSupportsWin('not a game', 'white', 'resign')).toBe(false)
  })
})

describe('settlement', () => {
  it('pays an AI win at the opponent tier, writes the record, the marker and the audit row', async () => {
    const db = useFakeDb(seed)
    const res = await sync({ id: 'ai:game-1', mode: 'ai', result: 'white', playerColor: 'white', pgn: WHITE_MATES, aiDifficulty: 'expert' })
    expect(res).toEqual({ ok: true, award: { castlePoints: 140, added: 40, unlockedJustNow: false } })
    expect(db.get('guests/ada/games/ai:game-1')).toMatchObject({ roomId: 'ai:game-1', mode: 'ai', result: 'white', aiDifficulty: 'expert', pgn: WHITE_MATES })
    expect(db.get('castle_point_awards/ada_chess-win_ai:game-1')).toMatchObject({ source: 'chess-win', delta: 40 })
    expect(db.audits()).toEqual([expect.objectContaining({ normalizedName: 'ada', uid: 'uid-ada', delta: 40, source: 'award:chess-win:ai-expert', metadata: { gameId: 'ai:game-1' } })])
  })

  it('records a loss or a draw without paying', async () => {
    const db = useFakeDb(seed)
    expect(await sync({ id: 'ai:loss-1', mode: 'ai', result: 'black', playerColor: 'white', pgn: BLACK_MATES, aiDifficulty: 'expert' })).toEqual({ ok: true, award: null })
    expect(await sync({ id: 'ai:draw-1', mode: 'ai', result: 'draw', playerColor: 'white', pgn: '1. e4 e5', endReason: 'stalemate', aiDifficulty: 'expert' })).toEqual({ ok: true, award: null })
    expect(db.get('guests/ada/games/ai:loss-1')).toBeDefined()
    expect(db.get('guests/ada')?.castlePoints).toBe(100)
    expect(db.audits()).toEqual([])
  })

  it('refuses to pay a claimed checkmate the PGN does not show, but still archives the game', async () => {
    const db = useFakeDb(seed)
    expect(await sync({ id: 'ai:fake-1', mode: 'ai', result: 'white', playerColor: 'white', pgn: '1. e4 e5 2. Nf3', aiDifficulty: 'expert' })).toEqual({ ok: true, award: null })
    expect(db.get('guests/ada/games/ai:fake-1')).toBeDefined()
    expect(db.get('castle_point_awards/ada_chess-win_ai:fake-1')).toBeUndefined()
  })

  it('an AI win without the player colour, or with an unknown tier, pays the legacy flat rate', async () => {
    useFakeDb(seed)
    expect((await sync({ id: 'ai:unk-1', mode: 'ai', result: 'white', playerColor: 'white', pgn: WHITE_MATES, aiDifficulty: 'godlike' })).award?.added).toBe(10)
    expect((await sync({ id: 'ai:unk-2', mode: 'ai', result: 'white', pgn: WHITE_MATES, aiDifficulty: 'expert' })).award).toBeNull()
  })

  it('a Local game pays the flat rate for either side winning', async () => {
    const db = useFakeDb(seed)
    expect((await sync({ id: 'local:win-1', mode: 'local', result: 'black', pgn: BLACK_MATES, whiteName: 'Ada', blackName: 'Dad' })).award?.added).toBe(10)
    expect(db.audits()[0]).toMatchObject({ source: 'award:chess-win', delta: 10 })
  })

  it('replaying the same id rewrites the record and adds nothing', async () => {
    const db = useFakeDb(seed)
    await sync({ id: 'ai:game-1', mode: 'ai', result: 'white', playerColor: 'white', pgn: WHITE_MATES, aiDifficulty: 'easy' })
    const again = await sync({ id: 'ai:game-1', mode: 'ai', result: 'white', playerColor: 'white', pgn: WHITE_MATES, aiDifficulty: 'easy' })
    expect(again.award).toEqual({ castlePoints: 110, added: 0, unlockedJustNow: false })
    expect(db.audits()).toHaveLength(1)
  })

  it('keeps the old guards: signed out, bad id, bypass identity', async () => {
    useFakeDb({ ...seed, 'chat_identity/uid-eve': { normalizedName: 'eve', isBypass: true } })
    expect(await codeOf(syncDeviceGame.run(callReq(null, { ...base, id: 'ai:game-1', mode: 'ai', result: 'white', pgn: WHITE_MATES })))).toBe('unauthenticated')
    expect(await codeOf(sync({ id: 'nope', mode: 'ai', result: 'white', pgn: WHITE_MATES }))).toBe('invalid-argument')
    expect(await codeOf(syncDeviceGame.run(callReq('uid-eve', { ...base, id: 'ai:game-1', mode: 'ai', result: 'white', pgn: WHITE_MATES })))).toBe('failed-precondition')
  })
})
