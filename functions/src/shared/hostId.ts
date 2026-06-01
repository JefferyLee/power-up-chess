// Shared HostId type for server-side code. Mirrors the client-side
// `apps/web/src/hosts/hosts.ts` definition.

export type HostId = 'lucy' | 'luca'

export function isHostId(s: string): s is HostId {
  return s === 'lucy' || s === 'luca'
}
