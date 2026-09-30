// requireOwnedGuest — the shared "is this castle name really yours"
// check. Exercised against a tiny in-memory stand-in for Firestore so
// it runs offline like the other unit tests (no emulator).

import { describe, expect, it } from 'vitest'
import type { Firestore, Transaction } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import { requireOwnedGuest } from './requireOwner'

function fakeDb(docs: Record<string, Record<string, unknown> | undefined>) {
  const reads: string[] = []
  const db = {
    doc: (path: string) => ({
      path,
      get: async () => {
        reads.push(`db:${path}`)
        return { data: () => docs[path] }
      },
    }),
  } as unknown as Firestore
  const tx = {
    get: async (ref: { path: string }) => {
      reads.push(`tx:${ref.path}`)
      return { data: () => docs[ref.path] }
    },
  } as unknown as Transaction
  return { db, tx, reads }
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof HttpsError ? e.code : `non-https:${String(e)}`
  }
}

describe('requireOwnedGuest', () => {
  const ada = { displayName: 'Ada', normalizedName: 'ada', uids: ['uid-ada', 'uid-ada-tablet'] }

  it('returns the guest doc when the caller uid is listed on it', async () => {
    const { db } = fakeDb({ 'guests/ada': ada })
    const r = await requireOwnedGuest(db, 'uid-ada-tablet', 'ada')
    expect(r.guest.displayName).toBe('Ada')
    expect(r.ref.path).toBe('guests/ada')
  })

  it('rejects a caller whose uid is not on the doc (permission-denied)', async () => {
    const { db } = fakeDb({ 'guests/ada': ada })
    expect(await codeOf(requireOwnedGuest(db, 'uid-eve', 'ada'))).toBe('permission-denied')
  })

  it('rejects a name with no guest doc — bypass guests never pass', async () => {
    const { db } = fakeDb({})
    expect(await codeOf(requireOwnedGuest(db, 'uid-x', 'ghost'))).toBe('failed-precondition')
  })

  it('rejects an empty name and a path-shaped name without reading', async () => {
    const { db, reads } = fakeDb({ 'guests/ada': ada })
    expect(await codeOf(requireOwnedGuest(db, 'uid-ada', ''))).toBe('permission-denied')
    expect(await codeOf(requireOwnedGuest(db, 'uid-ada', 'ada/private'))).toBe('permission-denied')
    expect(reads).toEqual([])
  })

  it('normalises the name the same way the rest of the castle does', async () => {
    const { db } = fakeDb({ 'guests/ada': ada })
    const r = await requireOwnedGuest(db, 'uid-ada', '  AdA ')
    expect(r.ref.path).toBe('guests/ada')
  })

  it('reads through the transaction when one is given', async () => {
    const { db, tx, reads } = fakeDb({ 'guests/ada': ada })
    await requireOwnedGuest(db, 'uid-ada', 'ada', tx)
    expect(reads).toEqual(['tx:guests/ada'])
  })

  it('treats a doc with a malformed uids field as not owned', async () => {
    const { db } = fakeDb({ 'guests/odd': { displayName: 'Odd', uids: 'uid-odd' } })
    expect(await codeOf(requireOwnedGuest(db, 'uid-odd', 'odd'))).toBe('permission-denied')
  })
})
