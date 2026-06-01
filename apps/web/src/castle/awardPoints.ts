// Thin client wrapper around callAwardCastlePoints that:
//   - skips the call for bypass guests (no Firestore record → would no-op)
//   - swallows network errors so awarding never blocks game flow
//   - returns the new total for the caller to update the identity context

import { callAwardCastlePoints, type AwardSource } from '../firebase/callables'
import type { CastleIdentity } from './identity'

export interface AwardResult {
  castlePoints: number
  added: number
  unlockedJustNow: boolean
}

export async function awardPoints(
  identity: CastleIdentity | null,
  award: AwardSource,
): Promise<AwardResult | null> {
  if (!identity || identity.isBypass) return null
  try {
    const res = await callAwardCastlePoints({
      normalizedName: identity.normalizedName,
      award,
    })
    return res
  } catch (err) {
    // Don't block game flow on a failed award; log + ignore.
    console.warn('awardCastlePoints failed:', err)
    return null
  }
}
