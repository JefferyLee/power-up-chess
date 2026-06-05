// Castle Map — the spine of the hidden text world.
//
// 6 rooms, hand-written in short atmospheric prose. The Great Hall is
// home base; the others branch off it (and one climbs the Tower).
// Each room declares its exits as direction → room-id; nothing is
// dynamic at this layer. Locked / teased rooms are mentioned in
// neighbour descriptions but absent from the exits map until a future
// phase wires up keys and items.
//
// Location is stored per-browser in localStorage under PUC_LOC_KEY so
// it survives a /exit + reopen. A separate visited-set tracks "first
// time here" so the welcome line fires once per room per browser.

export type RoomId =
  | 'hall'
  | 'nook'
  | 'wizard'
  | 'garden'
  | 'tower-foot'
  | 'study'
  | 'cellar'

export type Direction = 'n' | 's' | 'e' | 'w' | 'up' | 'down'

export interface Room {
  id: RoomId
  /** Short title for the prompt line, e.g. "Lucy's Reading Nook". */
  name: string
  /** 2-3 sentence atmospheric description. */
  description: string
  /** Exits keyed by canonical direction. */
  exits: Partial<Record<Direction, RoomId>>
  /** Optional in-room presence — drives /look's "X is here" line. */
  occupant?: string
  /** Optional flavour line shown the FIRST time the kid arrives. */
  firstVisit?: string
}

export const ROOMS: Record<RoomId, Room> = {
  hall: {
    id: 'hall',
    name: 'the Great Hall',
    description:
      'A long hearth crackles low. Faded banners hang from the rafters. The room opens north, east, west — and a stone stair drops south.',
    exits: { n: 'nook', e: 'wizard', w: 'garden', s: 'tower-foot' },
    firstVisit: 'You blink in the warm hearth-light. The Castle hums faintly around you.',
  },
  nook: {
    id: 'nook',
    name: 'Lucy’s Reading Nook',
    description:
      'Bookshelves climb past the lamplight into a dim that might be ceiling. A green-shaded lamp lights a single open book on the desk.',
    exits: { s: 'hall' },
    occupant: 'Lucy is curled in the armchair, half-reading.',
    firstVisit: 'Lucy looks up and smiles, as if she’s just remembered the end of a sentence.',
  },
  wizard: {
    id: 'wizard',
    name: 'the Wizard’s Antechamber',
    description:
      'Robes and worn chessboards line the walls. A duelling board waits in the center, pieces already set, white to move.',
    exits: { w: 'hall' },
    firstVisit: 'The pieces stir as you step in, as though the board recognises a new challenger.',
  },
  garden: {
    id: 'garden',
    name: 'the Garden Walk',
    description:
      'A flagstone path winds through dim hedges. Crickets, somewhere. The night air smells of jasmine and turned earth.',
    exits: { e: 'hall' },
    firstVisit: 'Something small darts away from your footfall — too fast to see clearly.',
  },
  'tower-foot': {
    id: 'tower-foot',
    name: 'the Tower Foot',
    description:
      'The base of a stone spiral. Steps wind up into the dark. A small iron hook waits on the wall — empty. A heavy oak door is set in the south wall, locked.',
    exits: { n: 'hall', up: 'study' },
    firstVisit: 'You crane your neck. The stair seems to climb further than the Tower is tall.',
  },
  study: {
    id: 'study',
    name: 'Luca’s Study',
    description:
      'A brass telescope tilts at the window. Charts of imaginary kingdoms cover the desk. Luca looks up and gives you a small nod.',
    exits: { down: 'tower-foot' },
    occupant: 'Luca is at his charts, marking something with a slow finger.',
    firstVisit: 'Luca slides a chair toward you with his foot, never lifting his eyes from the page.',
  },
  cellar: {
    id: 'cellar',
    name: 'the Cellar',
    description:
      'Cool air. The smell of old wood. Wine racks line the walls — most empty, a few wrapped in cloth. The lantern throws long, lazy shadows.',
    exits: { up: 'tower-foot' },
    firstVisit: 'You hold your breath, listening. Something soft, somewhere — water? a draft? You can\'t quite tell.',
  },
}

// ─── Location (per-browser) ──────────────────────────────────────────

const PUC_LOC_KEY = 'puc:terminal-room'
const PUC_VISITED_KEY = 'puc:terminal-visited'
const START_ROOM: RoomId = 'hall'

export function loadCurrentRoom(): RoomId {
  if (typeof window === 'undefined') return START_ROOM
  const stored = window.localStorage.getItem(PUC_LOC_KEY) as RoomId | null
  if (stored && ROOMS[stored]) return stored
  return START_ROOM
}

export function saveCurrentRoom(id: RoomId): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PUC_LOC_KEY, id)
}

export function loadVisited(): Set<RoomId> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(PUC_VISITED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as RoomId[]
    return new Set(arr.filter((id) => !!ROOMS[id]))
  } catch {
    return new Set()
  }
}

export function markVisited(id: RoomId): boolean {
  if (typeof window === 'undefined') return false
  const set = loadVisited()
  if (set.has(id)) return false
  set.add(id)
  window.localStorage.setItem(PUC_VISITED_KEY, JSON.stringify([...set]))
  return true
}

// ─── Direction parsing ──────────────────────────────────────────────

const DIRECTION_ALIASES: Record<string, Direction> = {
  n: 'n', north: 'n',
  s: 's', south: 's',
  e: 'e', east: 'e',
  w: 'w', west: 'w',
  u: 'up', up: 'up',
  d: 'down', down: 'down',
}

export function parseDirection(word: string): Direction | null {
  return DIRECTION_ALIASES[word.toLowerCase()] ?? null
}

const DIRECTION_LABEL: Record<Direction, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  up: 'up',
  down: 'down',
}

/** Live exits — same as room.exits, but with state-gated additions
 *  layered on top. Currently only Tower Foot gains a `s` exit to the
 *  Cellar once the lantern has unlocked the south door. Caller passes
 *  the cellar-open flag so this stays a pure function. */
export function liveExits(room: Room, cellarOpen: boolean): Partial<Record<Direction, RoomId>> {
  const exits = { ...room.exits }
  if (room.id === 'tower-foot' && cellarOpen) {
    exits.s = 'cellar'
  }
  return exits
}

/** Human-readable list of exits for the current room, e.g. "north, east, up". */
export function describeExits(room: Room, cellarOpen = false): string {
  const dirs = (Object.keys(liveExits(room, cellarOpen)) as Direction[])
    .map((d) => DIRECTION_LABEL[d])
  if (dirs.length === 0) return 'No obvious exits.'
  return dirs.join(', ')
}
