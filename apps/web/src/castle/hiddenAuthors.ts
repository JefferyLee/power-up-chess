// "Hide for me" — a per-device mute of another guest's chat lines.
// Stores the muted authors' normalized names in localStorage; ChatPanel
// filters their lines locally. Nothing leaves the device — the other
// guest, the server and everyone else see the Hall unchanged. (Same
// shape as clearedAt.ts.)

import { useEffect, useState } from 'react'

const KEY = 'puc:chat-hidden-authors:v1'

export function loadHiddenAuthors(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string' && n.length > 0) : []
  } catch {
    return []
  }
}

function save(list: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
    // Same-tab listeners only hear synthetic storage events.
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
  } catch { /* quota / privacy mode — ignore */ }
}

export function hideAuthor(normalizedName: string): void {
  if (!normalizedName) return
  const list = loadHiddenAuthors()
  if (!list.includes(normalizedName)) save([...list, normalizedName])
}

export function unhideAuthor(normalizedName: string): void {
  save(loadHiddenAuthors().filter((n) => n !== normalizedName))
}

/** React hook — the current muted set, live across hide / unhide. */
export function useHiddenAuthors(): ReadonlySet<string> {
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(loadHiddenAuthors()))
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === null) setSet(new Set(loadHiddenAuthors()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return set
}
