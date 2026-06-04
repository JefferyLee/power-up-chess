// Private stream — ephemeral per-tab "you typed something, the Castle
// answered" feed. Commands like /look, /who, /xyzzy push entries here;
// the terminal interleaves them with public chat in chronological order.
//
// Entries live in memory only (no localStorage, no Firestore) for the
// simple ones — they're meant to feel like a session, not a record.
// Phase C will introduce a persistent variant for /play state.

import { useCallback, useEffect, useState } from 'react'

export type PrivateEntryKind =
  | 'echo'      // you-typed-this, shown above the response
  | 'reply'     // the Castle / system / NPC speaks back
  | 'ascii'     // monospace block (chess board, art)
  | 'whisper'   // dim italic — flavour text / Easter egg

export interface PrivateEntry {
  id: string
  kind: PrivateEntryKind
  text: string
  /** ms epoch — used to interleave with public chat. */
  ts: number
}

/** Tiny pub/sub so multiple components (chat panel embedded + terminal
 *  overlay) can subscribe to the same per-tab stream. */
type Listener = (entries: PrivateEntry[]) => void
const subscribers = new Set<Listener>()
let stream: PrivateEntry[] = []

function emit(): void {
  for (const fn of subscribers) fn(stream)
}

let nextId = 1
export function pushPrivate(kind: PrivateEntryKind, text: string): void {
  stream = [...stream, { id: `p${nextId++}`, kind, text, ts: Date.now() }]
  emit()
}

/** Wipe the private stream. Used by /clear. */
export function clearPrivate(): void {
  stream = []
  emit()
}

/** React hook — subscribe + return the current stream snapshot. */
export function usePrivateStream(): PrivateEntry[] {
  const [entries, setEntries] = useState<PrivateEntry[]>(stream)
  const sub = useCallback((next: PrivateEntry[]) => setEntries(next), [])
  useEffect(() => {
    subscribers.add(sub)
    return () => { subscribers.delete(sub) }
  }, [sub])
  return entries
}
