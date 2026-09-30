// usePersistedState — React state mirrored into a registered storage
// key. Reads once on mount (falling back to `initial` when the key is
// absent, unparsable, or storage is unavailable) and writes whenever
// the value changes. Nothing is written on the mount pass, so a key
// the kid never touched stays absent.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { readKey, writeKey, type StorageKeyEntry } from './keys'

export interface PersistCodec<T> {
  parse?: (raw: string) => T
  serialize?: (value: T) => string
}

/** '1' / '0' flags — the convention most of our boolean keys use. */
export const flagCodec: Required<PersistCodec<boolean>> = {
  parse: (raw) => raw === '1',
  serialize: (v) => (v ? '1' : '0'),
}

const jsonCodec: Required<PersistCodec<unknown>> = {
  parse: (raw) => JSON.parse(raw) as unknown,
  serialize: (v) => JSON.stringify(v),
}

/** Pass a module-level codec (like `flagCodec`), not an inline object —
 *  the write effect keys on `serialize`, so a fresh object every render
 *  would write every render. */
export function usePersistedState<T>(
  entry: StorageKeyEntry,
  initial: T | (() => T),
  codec: PersistCodec<T> = jsonCodec as PersistCodec<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const parse = codec.parse ?? (jsonCodec.parse as (raw: string) => T)
  const serialize = codec.serialize ?? (jsonCodec.serialize as (v: T) => string)

  const [value, setValue] = useState<T>(() => {
    const fallback = () => (typeof initial === 'function' ? (initial as () => T)() : initial)
    const raw = readKey(entry)
    if (raw === null) return fallback()
    try {
      return parse(raw)
    } catch {
      return fallback()
    }
  })

  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    try {
      writeKey(entry, serialize(value))
    } catch {
      // serialize threw (cyclic value) — the in-memory state still stands.
    }
  }, [entry, value, serialize])

  return [value, setValue]
}
