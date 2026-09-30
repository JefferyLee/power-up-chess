// Firestore security rules tests.
//
// Requires the local Firestore emulator. Run via:
//
//   pnpm test:rules           (from repo root — wraps emulators:exec)
//
// or, with the emulator already running:
//
//   pnpm --filter @power-up-chess/functions test:rules
//
// Tests below assert that:
//   - Anonymous clients cannot read or write arbitrary docs.
//   - Anonymous clients cannot write to /rooms or /rooms/{}/moves.
//   - A listed room participant can read their room and its moves.
//   - A non-participant cannot read another player's room.

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { deleteDoc, doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = resolve(HERE, '../../firestore.rules')

let env: RulesTestEnvironment

beforeAll(async () => {
  setLogLevel('error')
  // Under `firebase emulators:exec` the env var points at the running
  // emulator (host:port from firebase.json); the fallback matches the
  // firebase.json port for anyone running the emulator by hand.
  const emulator = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180'
  const [host, port] = emulator.split(':')
  env = await initializeTestEnvironment({
    projectId: 'puc-rules-test',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: host || '127.0.0.1',
      port: Number(port) || 8180,
    },
  })
})

afterAll(async () => {
  if (env) await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

async function seedRoom(roomId: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `rooms/${roomId}`), data)
  })
}

describe('firestore rules: /rooms/{roomId}', () => {
  it('white participant can read the room they own', async () => {
    await seedRoom('R1', {
      white: { playerId: 'alice', displayName: 'Alice' },
      black: null,
      status: 'waiting',
    })
    const alice = env.authenticatedContext('alice')
    await assertSucceeds(getDoc(doc(alice.firestore(), 'rooms/R1')))
  })

  it('black participant can read the room they joined', async () => {
    await seedRoom('R2', {
      white: { playerId: 'alice', displayName: 'Alice' },
      black: { playerId: 'bob', displayName: 'Bob' },
      status: 'live',
    })
    const bob = env.authenticatedContext('bob')
    await assertSucceeds(getDoc(doc(bob.firestore(), 'rooms/R2')))
  })

  it('a third authenticated visitor (spectator) can read a room they are not in', async () => {
    await seedRoom('R3', {
      white: { playerId: 'alice', displayName: 'Alice' },
      black: { playerId: 'bob', displayName: 'Bob' },
      status: 'live',
    })
    const eve = env.authenticatedContext('eve')
    await assertSucceeds(getDoc(doc(eve.firestore(), 'rooms/R3')))
  })

  it('anonymous (unauthenticated) clients cannot read rooms', async () => {
    await seedRoom('R4', {
      white: { playerId: 'alice', displayName: 'Alice' },
      black: null,
      status: 'waiting',
    })
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'rooms/R4')))
  })

  it('clients cannot write to /rooms — only Cloud Functions may', async () => {
    const alice = env.authenticatedContext('alice')
    await assertFails(
      setDoc(doc(alice.firestore(), 'rooms/R5'), {
        white: { playerId: 'alice', displayName: 'Alice' },
        status: 'waiting',
      }),
    )
  })
})

describe('firestore rules: default deny', () => {
  it('reads to arbitrary collections fail', async () => {
    const alice = env.authenticatedContext('alice')
    await assertFails(getDoc(doc(alice.firestore(), 'random/x')))
  })

  it('writes to arbitrary collections fail', async () => {
    const alice = env.authenticatedContext('alice')
    await assertFails(setDoc(doc(alice.firestore(), 'random/x'), { hi: 1 }))
  })
})

describe('firestore rules: /commentary/{hash}', () => {
  it('authenticated clients can read cached commentary', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'commentary/abc'), { text: 'Nice.' })
    })
    const alice = env.authenticatedContext('alice')
    const snap = await getDoc(doc(alice.firestore(), 'commentary/abc'))
    expect(snap.exists()).toBe(true)
  })

  it('clients cannot write to /commentary', async () => {
    const alice = env.authenticatedContext('alice')
    await assertFails(setDoc(doc(alice.firestore(), 'commentary/abc'), { text: 'Hi' }))
  })
})

// ── Phase 0.3 (AUDIT_AND_PLAN) — coverage for the remaining main collections ──

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

describe('firestore rules: /guests/{normalizedName}', () => {
  it('the owner (uid listed on the doc) can read their guest doc', async () => {
    await seed('guests/ada', { displayName: 'Ada', uids: ['uid-ada'], castlePoints: 100 })
    const ada = env.authenticatedContext('uid-ada')
    await assertSucceeds(getDoc(doc(ada.firestore(), 'guests/ada')))
  })
  it('another signed-in user cannot read someone else’s guest doc', async () => {
    await seed('guests/ada', { displayName: 'Ada', uids: ['uid-ada'], castlePoints: 100 })
    const eve = env.authenticatedContext('uid-eve')
    await assertFails(getDoc(doc(eve.firestore(), 'guests/ada')))
  })
  it('clients cannot write guest docs (points are server-authoritative)', async () => {
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'guests/ada'), { castlePoints: 999999 }))
  })
})

describe('firestore rules: lobby chat + presence', () => {
  it('signed-in users can read lobby messages', async () => {
    await seed('lobby/messages/items/m1', { name: 'Ada', text: 'hi', kind: 'user', ts: 1 })
    const ada = env.authenticatedContext('uid-ada')
    await assertSucceeds(getDoc(doc(ada.firestore(), 'lobby/messages/items/m1')))
  })
  it('anonymous clients cannot read lobby messages', async () => {
    await seed('lobby/messages/items/m2', { name: 'Ada', text: 'hi', kind: 'user', ts: 1 })
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'lobby/messages/items/m2')))
  })
  it('clients cannot post chat directly (postChat function only)', async () => {
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'lobby/messages/items/mine'), { text: 'spoof', kind: 'user', ts: 1 }))
  })
  it('clients cannot write presence directly', async () => {
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'lobby/presence/items/s1'), { name: 'Ada' }))
  })
})

describe('firestore rules: /chat_identity/{uid}', () => {
  it('is fully function-only — even the owner cannot read or write', async () => {
    await seed('chat_identity/uid-ada', { displayName: 'Ada', normalizedName: 'ada' })
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(getDoc(doc(ada.firestore(), 'chat_identity/uid-ada')))
    await assertFails(setDoc(doc(ada.firestore(), 'chat_identity/uid-ada'), { displayName: 'Fake' }))
  })
})

describe('firestore rules: /invitations/{inviteId}', () => {
  it('signed-in users can read invitations; writes are function-only', async () => {
    await seed('invitations/i1', { from: 'ada', to: 'bob', status: 'pending' })
    const bob = env.authenticatedContext('uid-bob')
    await assertSucceeds(getDoc(doc(bob.firestore(), 'invitations/i1')))
    await assertFails(setDoc(doc(bob.firestore(), 'invitations/i2'), { from: 'bob', to: 'ada' }))
  })
})

describe('firestore rules: wizard rooms + chat', () => {
  it('signed-in users (incl. spectators) can read wizard rooms and messages', async () => {
    await seed('wizard_rooms/W1', { status: 'live' })
    await seed('wizard_rooms/W1/messages/m1', { text: 'gg', uid: 'uid-ada', ts: 1 })
    const eve = env.authenticatedContext('uid-eve')
    await assertSucceeds(getDoc(doc(eve.firestore(), 'wizard_rooms/W1')))
    await assertSucceeds(getDoc(doc(eve.firestore(), 'wizard_rooms/W1/messages/m1')))
  })
  it('even a player cannot write wizard chat directly (function-only)', async () => {
    await seed('wizard_rooms/W2', { status: 'live', white: { playerId: 'uid-ada' } })
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'wizard_rooms/W2/messages/mine'), { text: 'spoof', uid: 'uid-ada', ts: 1 }))
  })
})

describe('firestore rules: server-only counters & ledgers', () => {
  it('castle_enter_attempts is unreadable + unwritable by its own uid', async () => {
    await seed('castle_enter_attempts/uid-ada', { consecutiveWrong: 1 })
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(getDoc(doc(ada.firestore(), 'castle_enter_attempts/uid-ada')))
    await assertFails(setDoc(doc(ada.firestore(), 'castle_enter_attempts/uid-ada'), { consecutiveWrong: 0 }))
  })
  it('castle_point_audit is fully closed to clients', async () => {
    await seed('castle_point_audit/e1', { delta: 10 })
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(getDoc(doc(ada.firestore(), 'castle_point_audit/e1')))
    await assertFails(setDoc(doc(ada.firestore(), 'castle_point_audit/e2'), { delta: 99999 }))
  })
})

describe('firestore rules: /tournaments/{weekKey}', () => {
  it('signed-in users can read; writes are function-only', async () => {
    await seed('tournaments/2026-W27', { participants: [] })
    const ada = env.authenticatedContext('uid-ada')
    await assertSucceeds(getDoc(doc(ada.firestore(), 'tournaments/2026-W27')))
    await assertFails(setDoc(doc(ada.firestore(), 'tournaments/2026-W27'), { participants: [{ normalizedName: 'ada' }] }))
  })
})

// ── Published leaderboards: signed-in read, never client-writable ──────
// (display names only; the privacy opt-out is enforced by the writers)

describe('firestore rules: /puzzle_leaderboards/{plot}', () => {
  it('signed-in users can read a plot board (the client subscribes directly)', async () => {
    await seed('puzzle_leaderboards/mate', { plot: 'mate', topAllTime: [], topClimbers: [], weekKey: '2026-W40', refreshedAt: 1 })
    const ada = env.authenticatedContext('uid-ada')
    await assertSucceeds(getDoc(doc(ada.firestore(), 'puzzle_leaderboards/mate')))
  })
  it('anonymous clients cannot read a plot board', async () => {
    await seed('puzzle_leaderboards/fork', { plot: 'fork', topAllTime: [], topClimbers: [], weekKey: '2026-W40', refreshedAt: 1 })
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'puzzle_leaderboards/fork')))
  })
  it('clients cannot write a plot board (refreshPuzzleLeaderboards only)', async () => {
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'puzzle_leaderboards/mate'), { topAllTime: [{ displayName: 'Ada', rating: 9999 }] }))
  })
})

describe('firestore rules: /siege_leaderboards/{doc}', () => {
  it('signed-in users can read the global board; anonymous cannot', async () => {
    await seed('siege_leaderboards/global', { topEndless: [], topCampaign: [], topDaily: [], refreshedAt: 1 })
    const ada = env.authenticatedContext('uid-ada')
    await assertSucceeds(getDoc(doc(ada.firestore(), 'siege_leaderboards/global')))
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'siege_leaderboards/global')))
  })
  it('clients cannot write the board or the per-guest siege_scores', async () => {
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'siege_leaderboards/global'), { topEndless: [{ displayName: 'Ada', score: 1 }] }))
    await assertFails(setDoc(doc(ada.firestore(), 'siege_scores/ada'), { displayName: 'Ada', endlessBest: { score: 1 } }))
    await assertFails(getDoc(doc(ada.firestore(), 'siege_scores/ada')))
  })
})

describe('firestore rules: /forest_leaderboard/{normalizedName}', () => {
  it('signed-in users can read any row; anonymous cannot', async () => {
    await seed('forest_leaderboard/ada', { normalizedName: 'ada', displayName: 'Ada', best: 120, updatedAt: 1 })
    const bob = env.authenticatedContext('uid-bob')
    await assertSucceeds(getDoc(doc(bob.firestore(), 'forest_leaderboard/ada')))
    const anon = env.unauthenticatedContext()
    await assertFails(getDoc(doc(anon.firestore(), 'forest_leaderboard/ada')))
  })
  it('clients cannot write or delete rows — even their own', async () => {
    await seed('forest_leaderboard/ada', { normalizedName: 'ada', displayName: 'Ada', best: 120, updatedAt: 1 })
    const ada = env.authenticatedContext('uid-ada')
    await assertFails(setDoc(doc(ada.firestore(), 'forest_leaderboard/ada'), { normalizedName: 'ada', displayName: 'Ada', best: 200, updatedAt: 2 }))
    await assertFails(deleteDoc(doc(ada.firestore(), 'forest_leaderboard/ada')))
  })
})
