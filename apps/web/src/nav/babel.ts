// Corner of Babel — Jeff's library at cornerofbabel.com. The castle's door
// there is on the public side of floor 1, stair 0 (door 1.0); it leads
// here as `/?from=babel&door=<floor>.<stair>`. For the rest of that visit
// we remember the door so the castle can put the visitor back in front of
// it (`/zh/?pub=<floor>.<stair>`). The Library's small door uses the same
// address, and the castle's own door for everyone else.

import { KEYS, readKey, writeKey } from '../storage/keys'

export const BABEL_ORIGIN = 'https://cornerofbabel.com'
/** Where the castle's door stands in the library (`<floor>.<stair>`). */
export const CASTLE_DOOR = '1.0'
const DOOR_RE = /^-?\d+\.-?\d+$/

/** The `door` of a `?from=babel&door=F.S` arrival (the castle's own door
 *  when the library sent none), null when this visit did not come from
 *  Babel. */
export function parseBabelArrival(search: string): string | null {
  const q = new URLSearchParams(search)
  if (q.get('from') !== 'babel') return null
  const door = q.get('door') ?? ''
  return DOOR_RE.test(door) ? door : CASTLE_DOOR
}

export function rememberBabelArrival(search: string): void {
  const door = parseBabelArrival(search)
  if (door !== null) writeKey(KEYS.babelDoor, door)
}

/** Where to send this visitor back into the library, or null when they
 *  did not come from it. */
export function babelReturnUrl(): string | null {
  const door = readKey(KEYS.babelDoor)
  return door ? `${BABEL_ORIGIN}/zh/?pub=${door}` : null
}

/** The Library's small door: back to the door they came through, else
 *  the castle's own door in the library. */
export function babelLibraryUrl(): string {
  return babelReturnUrl() ?? `${BABEL_ORIGIN}/zh/?pub=${CASTLE_DOOR}`
}
