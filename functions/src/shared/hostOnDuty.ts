// Server mirror of apps/web/src/hosts/hostOnDuty.ts. Same formula, same
// output for the same instant. Used by setPresence (to stamp presence
// with the on-duty host) and hostAmbientStory (to narrate as the right
// host without polling presence).

import type { HostId } from './hostId'

export function hostOnDuty(now: number = Date.now()): HostId {
  const hour = Math.floor(now / (60 * 60 * 1000))
  return hour % 2 === 0 ? 'lucy' : 'luca'
}
