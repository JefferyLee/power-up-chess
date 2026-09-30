// createTeam — charges TEAM_CREATE_COST_CP and mints the team, the name
// lock and the Hall recruit card in one transaction. Covers the identity
// chain (chat_identity → guest ownership), the balance guard, the
// per-guest team limit, name uniqueness and the profanity scrub.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { TEAM_CREATE_COST_CP, TEAM_PER_USER_MAX } from '../castle/types'
import { createTeam } from './createTeam'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const identity = { displayName: 'Ada', normalizedName: 'ada', isBypass: false }
const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 150 }
const base = { 'chat_identity/uid-ada': identity, 'guests/ada': ada }
const create = (uid: string | null, data: Record<string, unknown>) =>
  createTeam.run(callReq(uid, { name: 'Lions', ...data } as never))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('guards', () => {
  it('rejects signed-out callers and names shorter than 2 characters', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(create(null, {}))).toBe('unauthenticated')
    expect(await codeOf(create('uid-ada', { name: 'L' }))).toBe('invalid-argument')
    expect(await codeOf(create('uid-ada', { name: '  \u0001 ' }))).toBe('invalid-argument')
    expect(db.writes).toEqual([])
  })

  it('rejects a profane name or motto outright (no starred-out middle tier)', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(create('uid-ada', { name: 'shit lions' }))).toBe('invalid-argument')
    expect(await codeOf(create('uid-ada', { motto: 'look up porn' }))).toBe('invalid-argument')
    expect(db.writes).toEqual([])
    expect(db.get('guests/ada')?.castlePoints).toBe(150)
  })

  it('requires a non-bypass chat identity and ownership of the guest it names', async () => {
    const db = useFakeDb({ 'guests/ada': ada })
    expect(await codeOf(create('uid-ada', {}))).toBe('failed-precondition')
    useFakeDb({ ...base, 'chat_identity/uid-ada': { ...identity, isBypass: true } })
    expect(await codeOf(create('uid-ada', {}))).toBe('failed-precondition')
    // chat_identity points at a name whose guest doc does not list this uid.
    useFakeDb({ ...base, 'guests/ada': { ...ada, uids: ['uid-other'] } })
    expect(await codeOf(create('uid-ada', {}))).toBe('permission-denied')
    expect(db.writes).toEqual([])
  })

  it('refuses when the balance is below the cost, and never charges', async () => {
    const db = useFakeDb({ ...base, 'guests/ada': { ...ada, castlePoints: TEAM_CREATE_COST_CP - 1 } })
    expect(await codeOf(create('uid-ada', {}))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('refuses a guest already in TEAM_PER_USER_MAX teams', async () => {
    const db = useFakeDb({ ...base, 'guests/ada': { ...ada, teamIds: Array.from({ length: TEAM_PER_USER_MAX }, (_, i) => `t${i}`) } })
    expect(await codeOf(create('uid-ada', {}))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('refuses a name already locked, case-insensitively', async () => {
    const db = useFakeDb({ ...base, 'team_names/lions': { teamId: 'zzz', normalizedTeamName: 'lions', createdAt: 1 } })
    expect(await codeOf(create('uid-ada', { name: 'LIONS' }))).toBe('already-exists')
    expect(db.writes).toEqual([])
  })
})

describe('happy path', () => {
  it('charges the cost, creates team + lock + recruit card, stamps the guest and audits the debit', async () => {
    const db = useFakeDb(base)
    // Spaces survive (only control chars are stripped); the lock key is URI-encoded.
    const r = await create('uid-ada', { name: ' Sea\u0007 Lions ', motto: '  Puzzles before bed ', badge: { shape: 'kite', bg: 'red' } })
    expect(r.castlePoints).toBe(150 - TEAM_CREATE_COST_CP)
    const { teamId } = r
    expect(teamId).toMatch(/^[a-z0-9]{6}$/)

    expect(db.get(`teams/${teamId}`)).toMatchObject({
      teamId, name: 'Sea Lions', normalizedName: 'sea lions', motto: 'Puzzles before bed',
      badge: { shape: 'kite', bg: '#3a5b9c' }, // invalid colour falls back to the default
      captainUid: 'uid-ada', captainNormalizedName: 'ada', captainDisplayName: 'Ada',
      members: [{ normalizedName: 'ada', displayName: 'Ada', joinedAt: NOW }], memberCount: 1, lastRecruitAt: NOW,
    })
    expect(db.get('team_names/sea%20lions')).toEqual({ teamId, normalizedTeamName: 'sea lions', createdAt: NOW })
    expect(db.get('guests/ada')).toMatchObject({ castlePoints: 50, teamIds: [teamId] })
    expect(db.audits()).toEqual([{
      normalizedName: 'ada', uid: 'uid-ada', delta: -TEAM_CREATE_COST_CP, before: 150, after: 50,
      source: 'team:create', metadata: { teamId, teamName: 'Sea Lions' }, serverTs: NOW,
    }])
    const card = db.writes.find((w) => w.path.startsWith('lobby/messages/items/'))?.data
    expect(card).toMatchObject({ kind: 'system', reportable: true, action: { kind: 'team-recruit', teamId, teamName: 'Sea Lions' } })
  })

  it('works with no badge at all (defaults carry no undefined fields)', async () => {
    const db = useFakeDb(base)
    const { teamId } = await create('uid-ada', {})
    expect(db.get(`teams/${teamId}`)?.badge).toEqual({
      shape: 'shield-heater', layout: 'solid', bg: '#3a5b9c', border: '#1a1530', symbol: 'king', symbolColor: '#f4c266',
    })
  })
})
