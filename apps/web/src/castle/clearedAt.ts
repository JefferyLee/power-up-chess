// /clear self-only chat hide. Stores a localStorage timestamp; the
// ChatPanel filters messages older than it. Per-device, per-browser —
// other guests see the chat unchanged.

import { useEffect, useState } from 'react'

const KEY = 'puc:chat-cleared-at'

export function loadClearedAt(): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

export function setClearedAtNow(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, String(Date.now()))
    // Dispatch a synthetic storage event so the React hook below
    // updates within the same tab (browsers only fire 'storage' for
    // OTHER tabs).
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  } catch { /* quota / privacy mode — ignore */ }
}

/** React hook — returns the current cleared-at timestamp, listens
 *  for changes via the storage event so the chat re-renders
 *  immediately after /clear. */
export function useClearedAt(): number {
  const [ts, setTs] = useState<number>(() => loadClearedAt())
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setTs(loadClearedAt())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return ts
}
