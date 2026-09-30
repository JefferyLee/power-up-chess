// "Hide for me" — a per-device mute of another guest's chat lines.
// Stores the muted authors' normalized names in localStorage; ChatPanel
// filters their lines locally. Nothing leaves the device — the other
// guest, the server and everyone else see the Hall unchanged. (Same
// shape as clearedAt.ts.)

import { useEffect, useState } from 'react'
import { KEYS, readJson, writeJson } from '../storage/keys'

const KEY = KEYS.chatHiddenAuthors

export function loadHiddenAuthors(): string[] {
  const parsed = readJson(KEY)
  return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string' && n.length > 0) : []
}

function save(list: string[]): void {
  if (!writeJson(KEY, list)) return
  // Same-tab listeners only hear synthetic storage events.
  window.dispatchEvent(new StorageEvent('storage', { key: KEY.key }))
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
      if (e.key === KEY.key || e.key === null) setSet(new Set(loadHiddenAuthors()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return set
}
