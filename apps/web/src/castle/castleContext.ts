// Context object + value type for the castle identity. Split from the
// provider component so react-refresh works in dev.

import { createContext } from 'react'
import type { HostId } from '../hosts/hosts'
import type { CastleCredential, CastleIdentity } from './identity'

export interface CastleContextValue {
  identity: CastleIdentity | null
  hostId: HostId
  /** Sign in the guest. Pass `credential` when the user just typed
   *  name + magic word — that enables the wicket's quick-enter on the
   *  next visit within the TTL. Omit it on bypass / quick-enter paths. */
  signIn: (identity: CastleIdentity, credential?: CastleCredential) => void
  signOut: () => void
  /** Update castlePoints (after a points-earning event). */
  setCastlePoints: (next: number) => void
  /** Remove `lastDecay` from the identity after the Hall has shown its
   *  welcome line. Idempotent — fine to call when no decay is present. */
  clearDecayInfo: () => void
  /** Remove `lastBonus` (Phase C check-in / starter / streak) after the
   *  Hall toast has fired. */
  clearBonusInfo: () => void
  /** Set the equipped piece-set id and persist it on the identity. */
  setPieceSetId: (id: string) => void
}

export const CastleContext = createContext<CastleContextValue | null>(null)
