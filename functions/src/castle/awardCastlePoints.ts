// awardCastlePoints — server-authoritative point award.
//
// Client sends `{normalizedName, award}` where `award` is a tagged union
// describing what happened (puzzle solve, chess win, post-game review).
// Server clamps the amount per `AWARD_CAPS` so a malicious client can't
// inflate their points. The caller's uid must appear in the target guest's
// `uids[]` array (set during castleEnter), so you can only award yourself.
//
// Bypass guests (no guests doc) silently get a no-op response — points
// don't persist anywhere for them.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  AWARD_CAPS,
  UNLOCK_THRESHOLD,
  type AwardCastlePointsRequest,
  type AwardCastlePointsResponse,
  type AwardSource,
  type GuestDoc,
} from './types'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

/** Resolve the source-tagged award to a final integer amount. */
function amountFor(award: AwardSource): number {
  switch (award.source) {
    case 'puzzle': {
      const base = clamp(award.scorePoints, AWARD_CAPS.puzzleMin, AWARD_CAPS.puzzleMax)
      return base + (award.isFirstSolve ? AWARD_CAPS.puzzleFirstSolveBonus : 0)
    }
    case 'chess-win':
      return AWARD_CAPS.chessWin
    case 'chess-review': {
      const brilliant = clamp(award.brilliant, 0, 20)
      const bestExcellent = clamp(award.bestExcellent, 0, 200)
      const total = brilliant * AWARD_CAPS.chessBrilliantEach + bestExcellent * AWARD_CAPS.chessBestExcellentEach
      return Math.min(total, AWARD_CAPS.chessReviewMax)
    }
  }
}

export const awardCastlePoints = onCall<AwardCastlePointsRequest, Promise<AwardCastlePointsResponse>>(
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before earning points.')
    }
    const uid = req.auth.uid
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const award = req.data?.award

    if (!normalizedName) {
      throw new HttpsError('invalid-argument', 'normalizedName is required.')
    }
    if (!award || typeof award !== 'object' || !('source' in award)) {
      throw new HttpsError('invalid-argument', 'award is required.')
    }

    const db = getFirestore()
    const guestRef = db.doc(`guests/${normalizedName}`)
    const snap = await guestRef.get()
    if (!snap.exists) {
      // Bypass guest or invalid name — silent no-op. Returning 0 keeps the
      // client UX simple and avoids leaking which names exist.
      return { castlePoints: 0, added: 0, unlockedJustNow: false }
    }
    const guest = snap.data() as GuestDoc
    if (!guest.uids.includes(uid)) {
      throw new HttpsError('permission-denied', 'You can only earn points for yourself.')
    }

    const amount = amountFor(award)
    if (amount <= 0) {
      return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
    }

    const before = guest.castlePoints
    const after = before + amount
    const unlockedJustNow = before < UNLOCK_THRESHOLD && after >= UNLOCK_THRESHOLD

    await guestRef.update({ castlePoints: after })

    return { castlePoints: after, added: amount, unlockedJustNow }
  },
)
