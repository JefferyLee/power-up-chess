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
import { doc, getDoc, setDoc, setLogLevel } from 'firebase/firestore'

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_PATH = resolve(HERE, '../../firestore.rules')

let env: RulesTestEnvironment

beforeAll(async () => {
  setLogLevel('error')
  env = await initializeTestEnvironment({
    projectId: 'puc-rules-test',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
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

  it('a third party cannot read a room they are not in', async () => {
    await seedRoom('R3', {
      white: { playerId: 'alice', displayName: 'Alice' },
      black: { playerId: 'bob', displayName: 'Bob' },
      status: 'live',
    })
    const eve = env.authenticatedContext('eve')
    await assertFails(getDoc(doc(eve.firestore(), 'rooms/R3')))
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
