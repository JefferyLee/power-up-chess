// castleBypass — issue a throwaway display name for visitors who got
// stuck on the magic-word screen. No Firestore record, no castle points,
// no leaderboard. The bypass guest is only visible to themselves and to
// other guests in the live Hall.

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { APP_CHECK } from '../callableOptions'
import { bumpAndCheck } from './chatRateLimit'
import type { CastleBypassResponse } from './types'

/** A visitor should only need a couple of bypass names; a scripted client
 *  minting hundreds is abuse (Phase 1.8). */
const BYPASS_PER_DAY = 10

export const castleBypass = onCall<void, Promise<CastleBypassResponse>>(APP_CHECK,
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before bypassing.')
    }
    const gate = await bumpAndCheck(req.auth.uid, 'bypass-day', BYPASS_PER_DAY)
    if (!gate.allowed) {
      throw new HttpsError('resource-exhausted', 'Too many guest names today — try again tomorrow.')
    }
    const n = Math.floor(1000 + Math.random() * 9000)
    return { displayName: `Guest-${n}` }
  },
)
