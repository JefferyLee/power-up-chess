// Routing root at `/` — shows the Gate before sign-in, the Hall after.

import { useCastle } from './useCastle'
import { GateScreen } from './GateScreen'
import { HallScreen } from './HallScreen'

export function CastleEntry() {
  const { identity } = useCastle()
  return identity ? <HallScreen /> : <GateScreen />
}
