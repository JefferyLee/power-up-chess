// In-memory Firestore stand-in for callable unit tests (no emulator).
//
// A test file mocks the SDK once at the top, then seeds documents:
//
//   vi.mock('firebase-admin/firestore', async () => (await import('../../test/fakeDb')).firestoreMock)
//   const { writes, get } = useFakeDb({ 'guests/ada': { ... } })
//   await submitSiegeScore.run(callReq('uid-ada', { ... }))
//
// It supports what the money-path callables use: doc().get(),
// collection().doc() / add(), and runTransaction with get / set / update /
// create / delete, `{ merge: true }`, dotted update keys and the
// FieldValue.increment / arrayUnion / arrayRemove / delete sentinels.
// Like the real SDK it buffers transaction writes until the body resolves,
// refuses a read after a write, refuses `undefined` values, and refuses
// update-of-missing / create-of-existing.

import type { CallableRequest } from 'firebase-functions/v2/https'
import { HttpsError } from 'firebase-functions/v2/https'

export type Doc = Record<string, unknown>

export interface FakeWrite {
  op: 'set' | 'update' | 'create' | 'delete'
  path: string
  data?: Doc
  merge?: boolean
}

export interface FakeDb {
  /** Live document store, keyed by full path. */
  docs: Record<string, Doc>
  /** Every committed write, in order. */
  writes: FakeWrite[]
  /** Current contents of a document (undefined when absent). */
  get: (path: string) => Doc | undefined
  /** Rows appended to castle_point_audit, in order. */
  audits: () => Doc[]
}

class Sentinel {
  constructor(readonly kind: 'increment' | 'arrayUnion' | 'arrayRemove' | 'delete', readonly arg: unknown) {}
}

export const FieldValue = {
  increment: (n: number) => new Sentinel('increment', n),
  arrayUnion: (...els: unknown[]) => new Sentinel('arrayUnion', els),
  arrayRemove: (...els: unknown[]) => new Sentinel('arrayRemove', els),
  delete: () => new Sentinel('delete', undefined),
}

function isPlainObject(v: unknown): v is Doc {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Sentinel)
}

function assertNoUndefined(v: unknown, at: string): void {
  if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (found in field "${at}")`)
  if (isPlainObject(v)) for (const [k, child] of Object.entries(v)) assertNoUndefined(child, at ? `${at}.${k}` : k)
}

function applyField(target: Doc, key: string, value: unknown): void {
  const parts = key.split('.')
  let obj = target
  for (const p of parts.slice(0, -1)) {
    if (!isPlainObject(obj[p])) obj[p] = {}
    obj = obj[p] as Doc
  }
  const last = parts[parts.length - 1]!
  if (!(value instanceof Sentinel)) {
    obj[last] = value
    return
  }
  const cur = obj[last]
  switch (value.kind) {
    case 'increment':
      obj[last] = (typeof cur === 'number' ? cur : 0) + (value.arg as number)
      break
    case 'arrayUnion': {
      const arr = Array.isArray(cur) ? [...cur] : []
      for (const e of value.arg as unknown[]) if (!arr.includes(e)) arr.push(e)
      obj[last] = arr
      break
    }
    case 'arrayRemove':
      obj[last] = (Array.isArray(cur) ? cur : []).filter((e) => !(value.arg as unknown[]).includes(e))
      break
    case 'delete':
      delete obj[last]
      break
  }
}

function commit(docs: Record<string, Doc>, w: FakeWrite): void {
  const existing = docs[w.path]
  if (w.op === 'delete') {
    delete docs[w.path]
    return
  }
  assertNoUndefined(w.data, '')
  if (w.op === 'update' && !existing) throw new Error(`NOT_FOUND: no document to update: ${w.path}`)
  if (w.op === 'create' && existing) throw new Error(`ALREADY_EXISTS: document already exists: ${w.path}`)
  const base = w.op === 'update' || w.merge ? { ...(existing ?? {}) } : {}
  for (const [k, v] of Object.entries(w.data ?? {})) applyField(base, k, v)
  docs[w.path] = base
}

let current: { db: unknown; handle: FakeDb } | null = null
let autoId = 0

/** Install a fresh fake database as what `getFirestore()` returns. */
export function useFakeDb(seed: Record<string, Doc> = {}): FakeDb {
  const docs: Record<string, Doc> = {}
  for (const [path, data] of Object.entries(seed)) docs[path] = structuredClone(data)
  const writes: FakeWrite[] = []
  autoId = 0

  const snapshot = (path: string) => ({
    id: path.split('/').pop(),
    exists: path in docs,
    data: () => (path in docs ? structuredClone(docs[path]) : undefined),
  })
  const docRef = (path: string) => ({
    path,
    id: path.split('/').pop(),
    get: async () => snapshot(path),
  })
  const collection = (path: string) => ({
    doc: (id?: string) => docRef(`${path}/${id ?? `auto-${++autoId}`}`),
    add: async (data: Doc) => {
      const w: FakeWrite = { op: 'create', path: `${path}/auto-${++autoId}`, data }
      commit(docs, w)
      writes.push(w)
      return docRef(w.path)
    },
  })
  const runTransaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    const pending: FakeWrite[] = []
    const stage = (w: FakeWrite) => {
      pending.push(w)
    }
    const tx = {
      get: async (ref: { path: string }) => {
        if (pending.length) throw new Error('Firestore transactions require all reads to be executed before all writes.')
        return snapshot(ref.path)
      },
      set: (ref: { path: string }, data: Doc, opts?: { merge?: boolean }) =>
        stage({ op: 'set', path: ref.path, data, merge: opts?.merge === true }),
      update: (ref: { path: string }, data: Doc) => stage({ op: 'update', path: ref.path, data }),
      create: (ref: { path: string }, data: Doc) => stage({ op: 'create', path: ref.path, data }),
      delete: (ref: { path: string }) => stage({ op: 'delete', path: ref.path }),
    }
    const result = await fn(tx)
    for (const w of pending) commit(docs, w)
    writes.push(...pending)
    return result
  }

  const handle: FakeDb = {
    docs,
    writes,
    get: (path) => docs[path],
    audits: () => writes.filter((w) => w.path.startsWith('castle_point_audit/')).map((w) => w.data!),
  }
  current = { db: { doc: docRef, collection, runTransaction }, handle }
  return handle
}

export function getFirestore(): unknown {
  if (!current) throw new Error('useFakeDb() must be called before the callable runs')
  return current.db
}

/** What `vi.mock('firebase-admin/firestore', ...)` should resolve to. */
export const firestoreMock = { getFirestore, FieldValue }

/** A CallableRequest as the handler sees it. `uid: null` = signed out. */
export function callReq<T>(
  uid: string | null,
  data: T,
  opts: { admin?: boolean; ip?: string } = {},
): CallableRequest<T> {
  return {
    data,
    auth: uid ? { uid, token: opts.admin ? { admin: true } : {} } : undefined,
    rawRequest: { headers: opts.ip ? { 'x-forwarded-for': opts.ip } : {} },
    acceptsStreaming: false,
  } as unknown as CallableRequest<T>
}

/** Resolve to the HttpsError code, 'ok', or 'non-https:<message>'. */
export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof HttpsError ? e.code : `non-https:${e instanceof Error ? e.message : String(e)}`
  }
}
