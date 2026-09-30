import { beforeEach, describe, expect, it } from 'vitest'
import { KEYS, listOurKeys, readJson, readKey, removeKey, writeJson, writeKey, type StorageKeyEntry } from './keys'

// Every `'puc:…'` / `'puc.…'` literal anywhere in src, so a key added
// without registering it fails here rather than surviving forget-me.
const sources = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('storage key registry', () => {
  const entries: StorageKeyEntry[] = Object.values(KEYS)

  it('has no duplicate keys', () => {
    const keys = entries.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('namespaces every key under puc', () => {
    for (const e of entries) expect(e.key).toMatch(/^puc[:.-]/)
  })

  it('keeps the version in sync with the key suffix', () => {
    for (const e of entries) {
      const m = /:v(\d+)$/.exec(e.key)
      if (m) expect(e.version).toBe(Number(m[1]))
      else expect(e.version).toBeUndefined()
    }
  })

  it('registers every storage key literal used in src', () => {
    const registered = new Set(entries.map((e) => e.key))
    const notKeys = new Set(['puc:template-only-changed']) // a window event name
    const unregistered: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('/keys.ts') || /\.test\.tsx?$/.test(path)) continue
      for (const m of text.matchAll(/['"](puc[:.][A-Za-z0-9:._-]+)['"]/g)) {
        const k = m[1]!
        if (!registered.has(k) && !notKeys.has(k)) unregistered.push(`${path}: ${k}`)
      }
    }
    expect(unregistered).toEqual([])
  })

  it('lists keys by scope', () => {
    expect(listOurKeys()).toHaveLength(entries.length)
    expect(listOurKeys('session')).toEqual([KEYS.calibrationDismissed.key])
    expect(listOurKeys('local')).toContain(KEYS.castleIdentity.key)
    expect(listOurKeys('local')).not.toContain(KEYS.calibrationDismissed.key)
  })
})

describe('guarded primitives', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('round-trips raw and JSON values in the right store', () => {
    expect(writeKey(KEYS.muted, '1')).toBe(true)
    expect(readKey(KEYS.muted)).toBe('1')
    expect(window.localStorage.getItem('puc:muted:v1')).toBe('1')

    expect(writeKey(KEYS.calibrationDismissed, '1')).toBe(true)
    expect(window.sessionStorage.getItem('puc-cal-dismissed')).toBe('1')
    expect(window.localStorage.getItem('puc-cal-dismissed')).toBeNull()

    writeJson(KEYS.siegeProgress, { stars: { gate: 2 } })
    expect(readJson(KEYS.siegeProgress)).toEqual({ stars: { gate: 2 } })
    removeKey(KEYS.siegeProgress)
    expect(readKey(KEYS.siegeProgress)).toBeNull()
  })

  it('returns null for absent or unparsable JSON', () => {
    expect(readJson(KEYS.siegeProgress)).toBeNull()
    window.localStorage.setItem('puc.siege.progress', '{nope')
    expect(readJson(KEYS.siegeProgress)).toBeNull()
  })

  it('swallows storage exceptions', () => {
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    Storage.prototype.getItem = () => { throw new Error('SecurityError') }
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError') }
    try {
      expect(readKey(KEYS.muted)).toBeNull()
      expect(writeKey(KEYS.muted, '1')).toBe(false)
      expect(() => removeKey(KEYS.muted)).not.toThrow()
    } finally {
      Storage.prototype.getItem = getItem
      Storage.prototype.setItem = setItem
    }
  })
})
