// /clear self-only chat hide. Stores a localStorage timestamp; the
// ChatPanel filters messages older than it. Per-device, per-browser —
// other guests see the chat unchanged.

import { useEffect, useState } from 'react'
import { KEYS, readKey, writeKey } from '../storage/keys'

const KEY = KEYS.chatClearedAt

export function loadClearedAt(): number {
  const n = Number(readKey(KEY) ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function setClearedAtNow(): void {
  if (!writeKey(KEY, String(Date.now()))) return
  // Dispatch a synthetic storage event so the React hook below
  // updates within the same tab (browsers only fire 'storage' for
  // OTHER tabs).
  window.dispatchEvent(new StorageEvent('storage', { key: KEY.key }))
}

/** React hook — returns the current cleared-at timestamp, listens
 *  for changes via the storage event so the chat re-renders
 *  immediately after /clear. */
export function useClearedAt(): number {
  const [ts, setTs] = useState<number>(() => loadClearedAt())
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY.key || e.key === null) setTs(loadClearedAt())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return ts
}
