// Shared time-control validator used by every endpoint that mints or
// transmits a game's clock setup: createRoom, sendInvite, future room
// reset flows, etc. Keeps the bounds in one place so we never end up
// with a 1-day-cap-on-create-but-2-day-on-invite kind of bug again.

import { HttpsError } from 'firebase-functions/v2/https'
import type { TimeControl } from './types'

const MIN_INITIAL_MS = 30 * 1000          // 30 s — anything shorter is unplayable
const MAX_INITIAL_MS = 24 * 60 * 60 * 1000 // 24 h — the "1 day" correspondence preset
const MAX_INCREMENT_MS = 60 * 1000         // 1 min — anything bigger is silly

export function sanitiseTimeControl(tc: TimeControl | null): TimeControl | null {
  if (tc === null) return null
  const initialMs = Number(tc.initialMs)
  const incrementMs = Number(tc.incrementMs ?? 0)
  if (!Number.isFinite(initialMs) || initialMs < MIN_INITIAL_MS || initialMs > MAX_INITIAL_MS) {
    throw new HttpsError('invalid-argument', 'Invalid timeControl.initialMs.')
  }
  if (!Number.isFinite(incrementMs) || incrementMs < 0 || incrementMs > MAX_INCREMENT_MS) {
    throw new HttpsError('invalid-argument', 'Invalid timeControl.incrementMs.')
  }
  return { initialMs, incrementMs }
}
