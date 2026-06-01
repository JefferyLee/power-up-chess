// Time-based "host on duty" rotation.
//
// Same host for everyone at the same wall-clock moment. We rotate per
// HOUR — at 09:00 UTC it's Lucy, at 10:00 UTC it's Luca, etc. This means
// a guest who reloads two minutes later sees the same host; a guest in a
// different time zone sees the same host as another guest in another
// time zone at the same instant.
//
// Mirrored exactly on the server (functions/src/shared/hostOnDuty.ts) so
// presence + ambient stories agree with the client.

import type { HostId } from './hosts'

/** Returns the host on duty at the given timestamp (ms since epoch). */
export function hostOnDuty(now: number = Date.now()): HostId {
  const hour = Math.floor(now / (60 * 60 * 1000))
  return hour % 2 === 0 ? 'lucy' : 'luca'
}

/** Ms until the next host changeover. Useful for scheduling a UI refresh. */
export function msUntilNextRotation(now: number = Date.now()): number {
  const HOUR = 60 * 60 * 1000
  return HOUR - (now % HOUR)
}
