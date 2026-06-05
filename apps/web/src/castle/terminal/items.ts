// Castle items + per-browser inventory.
//
// Items live in rooms; the kid /takes them, /uses them, /examines
// them, /drops them. Inventory is local-only (browser storage) —
// matches the rest of the terminal's session-feel. Items are
// declarative: each one names its starting room, whether it can be
// taken, and a one-line examine blurb.
//
// Use-effects live OUTSIDE the registry (in commandRegistry's tryUse
// function) because a use can mutate game state — unlocking the
// Cellar door is the canonical example.

import type { RoomId } from './world'

export type ItemId = 'lantern' | 'bookmark' | 'feather' | 'compass'

export interface Item {
  id: ItemId
  /** Short name the kid types ("lantern"). */
  name: string
  /** Display blurb in /look and /examine ("a small brass lantern"). */
  longName: string
  /** /examine result — 1-2 sentences. */
  description: string
  /** Starting room. Items are single-instance — once picked up,
   *  they're gone from the room forever (within this browser). */
  startRoom: RoomId
  /** Can the kid /take it? Some items are fixtures (Luca's compass
   *  is for examining, not pocketing). */
  takeable: boolean
}

export const ITEMS: Record<ItemId, Item> = {
  lantern: {
    id: 'lantern',
    name: 'lantern',
    longName: 'a small brass lantern',
    description: 'A small lantern with a stub of candle inside. Light, hold, hope.',
    startRoom: 'tower-foot',
    takeable: true,
  },
  bookmark: {
    id: 'bookmark',
    name: 'bookmark',
    longName: 'a paper bookmark',
    description: 'A pressed-flower bookmark. Lucy probably forgot where she left it.',
    startRoom: 'nook',
    takeable: true,
  },
  feather: {
    id: 'feather',
    name: 'feather',
    longName: 'a long grey feather',
    description: 'A long grey feather, neat at the quill end. Might write something.',
    startRoom: 'garden',
    takeable: true,
  },
  compass: {
    id: 'compass',
    name: 'compass',
    longName: 'a brass compass on the desk',
    description: 'The needle wavers — points to nothing in particular. Luca uses it to "find the mood."',
    startRoom: 'study',
    takeable: false,
  },
}

// ─── Storage ────────────────────────────────────────────────────────

const INVENTORY_KEY = 'puc:terminal-inventory'   // items the kid carries
const TAKEN_KEY = 'puc:terminal-taken'           // items already removed from rooms
const CELLAR_OPEN_KEY = 'puc:terminal-cellar-open'

function readSet(key: string): Set<ItemId> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as ItemId[]
    return new Set(arr.filter((id) => !!ITEMS[id]))
  } catch {
    return new Set()
  }
}

function writeSet(key: string, set: Set<ItemId>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify([...set]))
}

export function loadInventory(): Set<ItemId> { return readSet(INVENTORY_KEY) }
export function loadTaken(): Set<ItemId> { return readSet(TAKEN_KEY) }

export function isCarried(id: ItemId): boolean { return loadInventory().has(id) }

/** Move an item from the room to the kid's inventory. Returns true
 *  if the take succeeded, false if it was already taken / wasn't
 *  here / wasn't takeable. */
export function takeItem(id: ItemId): boolean {
  const inv = loadInventory()
  if (inv.has(id)) return false
  inv.add(id)
  writeSet(INVENTORY_KEY, inv)
  const taken = loadTaken()
  taken.add(id)
  writeSet(TAKEN_KEY, taken)
  return true
}

/** Drop an item from the inventory back into the current room. */
export function dropItem(id: ItemId): boolean {
  const inv = loadInventory()
  if (!inv.has(id)) return false
  inv.delete(id)
  writeSet(INVENTORY_KEY, inv)
  return true
}

/** Items still sitting in this room — startRoom matches AND the kid
 *  hasn't already taken it. Untaken fixtures (compass) always show. */
export function itemsInRoom(roomId: RoomId): Item[] {
  const taken = loadTaken()
  return Object.values(ITEMS).filter((it) =>
    it.startRoom === roomId && !taken.has(it.id),
  )
}

export function findItemByName(name: string): Item | null {
  const slug = name.trim().toLowerCase()
  for (const it of Object.values(ITEMS)) {
    if (it.name.toLowerCase() === slug) return it
  }
  return null
}

// ─── Cellar door ────────────────────────────────────────────────────

export function isCellarOpen(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(CELLAR_OPEN_KEY) === '1'
}

export function markCellarOpen(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CELLAR_OPEN_KEY, '1')
}
