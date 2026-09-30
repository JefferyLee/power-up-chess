// Captain-only team mutations. Every handler must refuse a non-captain
// before writing; rename / rebadge / recruit also carry a 1-per-week
// rate limit and rename swaps the name lock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { kickMember, postTeamRecruitment, rebadgeTeam, renameTeam, transferCaptain } from './captainActions'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const badge = { shape: 'shield-heater', layout: 'solid', bg: '#3a5b9c', border: '#1a1530', symbol: 'king', symbolColor: '#f4c266' }
const team = {
  teamId: 't1', name: 'Lions', normalizedName: 'lions', motto: 'Roar', badge,
  captainUid: 'uid-ada', captainNormalizedName: 'ada', captainDisplayName: 'Ada',
  members: [
    { normalizedName: 'ada', displayName: 'Ada', joinedAt: 1 },
    { normalizedName: 'bob', displayName: 'Bob', joinedAt: 2 },
  ],
  memberCount: 2, createdAt: 1, lastChangeAt: 1,
}
const base = {
  'teams/t1': team,
  'team_names/lions': { teamId: 't1', normalizedTeamName: 'lions', createdAt: 1 },
  'guests/ada': { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada'], castlePoints: 0, teamIds: ['t1'] },
  'guests/bob': { displayName: 'Bob', normalizedName: 'bob', uids: ['uid-bob', 'uid-bob-2'], castlePoints: 0, teamIds: ['t1'] },
}
const call = <T>(fn: { run: (r: never) => Promise<T> }, uid: string | null, data: Record<string, unknown>) =>
  fn.run(callReq(uid, { teamId: 't1', ...data }) as never)

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('captain-only guard', () => {
  const actions: Array<[string, { run: (r: never) => Promise<unknown> }, Record<string, unknown>]> = [
    ['transferCaptain', transferCaptain, { toNormalizedName: 'bob' }],
    ['kickMember', kickMember, { normalizedName: 'ada' }],
    ['renameTeam', renameTeam, { name: 'Tigers' }],
    ['rebadgeTeam', rebadgeTeam, { badge }],
    ['postTeamRecruitment', postTeamRecruitment, {}],
  ]
  for (const [label, fn, data] of actions) {
    it(`${label}: signed-out → unauthenticated, member → permission-denied, unknown team → not-found`, async () => {
      const db = useFakeDb(base)
      expect(await codeOf(call(fn, null, data))).toBe('unauthenticated')
      expect(await codeOf(call(fn, 'uid-bob', data))).toBe('permission-denied')
      expect(await codeOf(call(fn, 'uid-ada', { ...data, teamId: 'nope' }))).toBe('not-found')
      expect(db.writes).toEqual([])
    })
  }
})

describe('transferCaptain', () => {
  it('hands the title to a member, binding it to that member’s first uid', async () => {
    const db = useFakeDb(base)
    expect(await call(transferCaptain, 'uid-ada', { toNormalizedName: 'Bob' })).toEqual({ ok: true })
    expect(db.get('teams/t1')).toMatchObject({ captainUid: 'uid-bob', captainNormalizedName: 'bob', captainDisplayName: 'Bob' })
  })

  it('refuses a non-member; transferring to yourself is a no-op', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(call(transferCaptain, 'uid-ada', { toNormalizedName: 'eve' }))).toBe('failed-precondition')
    expect(await call(transferCaptain, 'uid-ada', { toNormalizedName: 'ada' })).toEqual({ ok: true })
    expect(db.writes).toEqual([])
  })
})

describe('kickMember', () => {
  it('removes the member from the roster and the team from their guest doc', async () => {
    const db = useFakeDb(base)
    await call(kickMember, 'uid-ada', { normalizedName: 'bob' })
    expect(db.get('teams/t1')).toMatchObject({ members: [team.members[0]], memberCount: 1, lastChangeAt: NOW })
    expect(db.get('guests/bob')?.teamIds).toEqual([])
  })

  it('refuses to kick the captain or a non-member', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(call(kickMember, 'uid-ada', { normalizedName: 'ada' }))).toBe('failed-precondition')
    expect(await codeOf(call(kickMember, 'uid-ada', { normalizedName: 'eve' }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })
})

describe('renameTeam', () => {
  it('rejects a profane name or motto and a too-short name before reading', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'shit' }))).toBe('invalid-argument')
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'Tigers', motto: 'look up porn' }))).toBe('invalid-argument')
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'T' }))).toBe('invalid-argument')
    expect(db.writes).toEqual([])
  })

  it('swaps the name lock and refuses a name someone else holds', async () => {
    const db = useFakeDb(base)
    expect(await call(renameTeam, 'uid-ada', { name: 'Tigers', motto: 'Grr' })).toEqual({ ok: true, name: 'Tigers' })
    expect(db.get('teams/t1')).toMatchObject({ name: 'Tigers', normalizedName: 'tigers', motto: 'Grr', lastRenamedAt: NOW })
    expect(db.get('team_names/lions')).toBeUndefined()
    expect(db.get('team_names/tigers')).toEqual({ teamId: 't1', normalizedTeamName: 'tigers', createdAt: NOW })

    const taken = useFakeDb({ ...base, 'team_names/tigers': { teamId: 't9', normalizedTeamName: 'tigers', createdAt: 1 } })
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'Tigers' }))).toBe('already-exists')
    expect(taken.writes).toEqual([])
  })

  it('an empty motto clears the stored one instead of failing the write', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'Lions' }))).toBe('ok')
    expect(db.get('teams/t1')).not.toHaveProperty('motto')
    expect(db.get('team_names/lions')).toBeDefined()
  })

  it('is limited to once a week', async () => {
    const db = useFakeDb({ ...base, 'teams/t1': { ...team, lastRenamedAt: NOW - WEEK_MS + 1 } })
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'Tigers' }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
    useFakeDb({ ...base, 'teams/t1': { ...team, lastRenamedAt: NOW - WEEK_MS } })
    expect(await codeOf(call(renameTeam, 'uid-ada', { name: 'Tigers' }))).toBe('ok')
  })
})

describe('rebadgeTeam / postTeamRecruitment', () => {
  it('rebadge stores the sanitised badge and is limited to once a week', async () => {
    const db = useFakeDb(base)
    await call(rebadgeTeam, 'uid-ada', { badge: { ...badge, shape: 'kite', symbol: 'unicorn' } })
    expect(db.get('teams/t1')).toMatchObject({ badge: { ...badge, shape: 'kite', symbol: 'king' }, lastRebadgedAt: NOW })
    expect(await codeOf(call(rebadgeTeam, 'uid-ada', { badge }))).toBe('failed-precondition')
  })

  it('recruit card goes to the Hall once a week', async () => {
    const db = useFakeDb(base)
    expect(await call(postTeamRecruitment, 'uid-ada', {})).toEqual({ ok: true })
    const card = db.writes.find((w) => w.path.startsWith('lobby/messages/items/'))?.data
    expect(card).toMatchObject({ kind: 'system', reportable: true, action: { kind: 'team-recruit', teamId: 't1', memberCount: 2 } })
    expect(db.get('teams/t1')?.lastRecruitAt).toBe(NOW)
    expect(await codeOf(call(postTeamRecruitment, 'uid-ada', {}))).toBe('failed-precondition')
  })
})
