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
