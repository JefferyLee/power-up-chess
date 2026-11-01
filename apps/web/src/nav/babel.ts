// Corner of Babel — Jeff's library at cornerofbabel.com. Its public-side
// door leads here as `/?from=babel&door=<floor>.<stair>`; for the rest of
// that visit we remember the door so the castle can put the visitor back
// in front of it (`/zh/?pub=<floor>.<stair>`). The Library's small door
// uses the same address, falling back to the library's entrance.

import { KEYS, readKey, writeKey } from '../storage/keys'

export const BABEL_ORIGIN = 'https://cornerofbabel.com'
const DOOR_RE = /^-?\d+\.-?\d+$/

/** The `door` of a `?from=babel&door=F.S` arrival, '' when the library
 *  sent no usable door, null when this visit did not come from Babel. */
export function parseBabelArrival(search: string): string | null {
  const q = new URLSearchParams(search)
  if (q.get('from') !== 'babel') return null
  const door = q.get('door') ?? ''
  return DOOR_RE.test(door) ? door : ''
}

export function rememberBabelArrival(search: string): void {
  const door = parseBabelArrival(search)
  if (door !== null) writeKey(KEYS.babelDoor, door)
}

/** Where to send this visitor back into the library, or null when they
 *  did not come from it. */
export function babelReturnUrl(): string | null {
  const door = readKey(KEYS.babelDoor)
  if (door === null) return null
  return door ? `${BABEL_ORIGIN}/zh/?pub=${door}` : `${BABEL_ORIGIN}/zh/`
}

/** The Library's small door: back to the door they came through, else
 *  the library's entrance. */
export function babelLibraryUrl(): string {
  return babelReturnUrl() ?? `${BABEL_ORIGIN}/zh/`
}
