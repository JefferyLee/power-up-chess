// overrideTournamentResult — admin-claim gate (isAdmin) plus the owner /
// session check that binds the override to the admin's own castle name.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callReq, codeOf, useFakeDb } from '../../test/fakeDb'
import { overrideTournamentResult } from './overrideTournamentResult'
import { BYE_OPPONENT } from './types'
import { tournamentWeekKey } from './weekKey'

vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)

const NOW = 1_800_000_000_000
const PATH = `tournaments/${tournamentWeekKey(NOW)}`
const jeff = { displayName: 'Jeff', normalizedName: 'jeff', uids: ['uid-jeff'], castlePoints: 0, activeSessionId: 'sess-j' }
const disputed = { index: 0, white: 'ada', black: 'bob', result: 'white-wins', reportedBy: 'ada', reportedAt: 10, disputed: { byNormalizedName: 'bob', at: 11, reason: 'I won' } }
const bye = { index: 1, white: 'cat', black: BYE_OPPONENT, result: 'bye-white' }
const tournament = {
  weekKey: tournamentWeekKey(NOW), status: 'active', openedAt: 1, closesAt: 2, participants: [],
  rounds: [{ index: 0, startedAt: 1, pairings: [disputed, bye] }],
}
const base = { 'guests/jeff': jeff, [PATH]: tournament }
const override = (uid: string | null, data: Record<string, unknown> = {}, admin = true) =>
  overrideTournamentResult.run(callReq(uid, {
    normalizedName: 'jeff', sessionId: 'sess-j', roundIndex: 0, pairingIndex: 0, result: 'black-wins', ...data,
  } as never, { admin }))

beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ['Date'] }))
afterEach(() => vi.useRealTimers())

describe('overrideTournamentResult', () => {
  it('requires the admin custom claim — a signed-in non-admin is refused before any read', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(override(null))).toBe('unauthenticated')
    expect(await codeOf(override('uid-jeff', {}, false))).toBe('permission-denied')
    expect(db.writes).toEqual([])
  })

  it('refuses malformed indices and a bye result, even from an admin', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(override('uid-jeff', { roundIndex: 0.5 }))).toBe('permission-denied')
    expect(await codeOf(override('uid-jeff', { result: 'bye-white' }))).toBe('permission-denied')
    expect(await codeOf(override('uid-jeff', { result: 'white-wins-ish' }))).toBe('permission-denied')
    expect(db.writes).toEqual([])
  })

  it('still binds the override to a castle name the admin owns, with a live session', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(override('uid-jeff', { normalizedName: 'ada' }))).toBe('failed-precondition') // no such guest doc
    useFakeDb({ ...base, 'guests/ada': { ...jeff, normalizedName: 'ada', uids: ['uid-ada'] } })
    expect(await codeOf(override('uid-jeff', { normalizedName: 'ada' }))).toBe('permission-denied')
    expect(await codeOf(override('uid-jeff', { sessionId: 'sess-stale' }))).toBe('failed-precondition')
    expect(db.writes).toEqual([])
  })

  it('rewrites the pairing, keeps the previous result in overriddenBy and clears the dispute', async () => {
    const db = useFakeDb(base)
    const r = await override('uid-jeff')
    const pairing = { index: 0, white: 'ada', black: 'bob', result: 'black-wins', reportedBy: 'jeff', reportedAt: NOW, overriddenBy: { normalizedName: 'jeff', at: NOW, previousResult: 'white-wins' } }
    expect(r.tournament.rounds[0]!.pairings[0]).toEqual(pairing)
    expect(db.get(PATH)?.rounds).toEqual([{ index: 0, startedAt: 1, pairings: [pairing, bye] }])
  })

  it('refuses a bye pairing and unknown round / pairing indices', async () => {
    const db = useFakeDb(base)
    expect(await codeOf(override('uid-jeff', { pairingIndex: 1 }))).toBe('failed-precondition')
    expect(await codeOf(override('uid-jeff', { pairingIndex: 7 }))).toBe('not-found')
    expect(await codeOf(override('uid-jeff', { roundIndex: 3 }))).toBe('not-found')
    expect(db.writes).toEqual([])
  })
})
