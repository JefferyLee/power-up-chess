// Host registry. Lucy and Luca are the two twin hosts.
// Phase 2 adds persona prompts and the template library; this file is the bare
// minimum the UI needs to let a player pick one.

export type HostId = 'lucy' | 'luca'

export interface HostDescriptor {
  id: HostId
  name: string
  blurb: string
}

export const HOSTS: Record<HostId, HostDescriptor> = {
  lucy: {
    id: 'lucy',
    name: 'Lucy',
    blurb: 'Warm and patient. Likes to point out what worked, and why.',
  },
  luca: {
    id: 'luca',
    name: 'Luca',
    blurb: 'Curious and adventurous. Loves brave plans and sharp tactics.',
  },
}

/** Choice descriptors include Both and Surprise alongside the two real hosts.
 *  These are what the StartScreen picker renders; resolution to a concrete
 *  HostId happens at game-start time. */
export interface HostChoiceDescriptor {
  id: 'lucy' | 'luca' | 'both' | 'surprise'
  name: string
  blurb: string
}

export const HOST_CHOICES: HostChoiceDescriptor[] = [
  HOSTS.lucy,
  HOSTS.luca,
  {
    id: 'both',
    name: 'Both',
    blurb: "Lucy and Luca take turns reacting throughout the game.",
  },
  {
    id: 'surprise',
    name: 'Surprise',
    blurb: "A random host shows up to play with you.",
  },
]

/** Header label given a primary host + optional co-host. */
export function hostsLabel(primary: HostId, coHost?: HostId): string {
  if (coHost && coHost !== primary) {
    return `${HOSTS[primary].name} & ${HOSTS[coHost].name}`
  }
  return HOSTS[primary].name
}
