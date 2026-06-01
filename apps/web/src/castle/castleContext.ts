// Context object + value type for the castle identity. Split from the
// provider component so react-refresh works in dev.

import { createContext } from 'react'
import type { HostId } from '../hosts/hosts'
import type { CastleIdentity } from './identity'

export interface CastleContextValue {
  identity: CastleIdentity | null
  hostId: HostId
  signIn: (identity: CastleIdentity) => void
  signOut: () => void
  /** Update castlePoints (after a points-earning event). */
  setCastlePoints: (next: number) => void
  /** Remove `lastDecay` from the identity after the Hall has shown its
   *  welcome line. Idempotent — fine to call when no decay is present. */
  clearDecayInfo: () => void
}

export const CastleContext = createContext<CastleContextValue | null>(null)
