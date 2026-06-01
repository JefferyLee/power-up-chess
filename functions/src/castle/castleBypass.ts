// castleBypass — issue a throwaway display name for visitors who got
// stuck on the magic-word screen. No Firestore record, no castle points,
// no leaderboard. The bypass guest is only visible to themselves and to
// other guests in the live Hall.

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { CastleBypassResponse } from './types'

export const castleBypass = onCall<void, Promise<CastleBypassResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before bypassing.')
    }
    const n = Math.floor(1000 + Math.random() * 9000)
    return { displayName: `Guest-${n}` }
  },
)
