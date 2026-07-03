// awardCastlePoints — server-authoritative point award.
//
// Client sends `{normalizedName, award}` where `award` is a tagged union
// describing what happened (puzzle solve, chess win, post-game review).
// Server clamps the amount per `AWARD_CAPS` so a malicious client can't
// inflate their points. The caller's uid must appear in the target guest's
// `uids[]` array (set during castleEnter), so you can only award yourself.
//
// Phase C: per-source daily caps. Each award is clamped against
// `dailyEarn[source]` so e.g. 50 puzzles a day can't farm unlimited
// points. The bucket auto-resets when the day rolls over.
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
  type GuestDailyEarn,
  type GuestDoc,
} from './types'
import { appendAuditTx } from './audit'
import { extractIp } from './ipGeo'

const DAY_MS = 24 * 60 * 60 * 1000

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
    case 'chess-win': {
      // Newer clients send an opponent tier; older ones don't. Fall back
      // to the legacy flat rate so old builds keep paying out.
      const op = award.opponent
      if (op && op in AWARD_CAPS.chessWinByOpponent) {
        return AWARD_CAPS.chessWinByOpponent[op]
      }
      return AWARD_CAPS.chessWin
    }
    case 'chess-review': {
      const brilliant = clamp(award.brilliant, 0, 20)
      const bestExcellent = clamp(award.bestExcellent, 0, 200)
      const total = brilliant * AWARD_CAPS.chessBrilliantEach + bestExcellent * AWARD_CAPS.chessBestExcellentEach
      return Math.min(total, AWARD_CAPS.chessReviewMax)
    }
    case 'mystery':
      return AWARD_CAPS.mysteryReward
  }
}

/** Which dailyEarn bucket + daily cap apply to this award source.
 *  `forest` is intentionally not handled here — Forest pays out via
 *  submitForestScore directly. */
function dailyCapFor(source: AwardSource['source']): {
  key: 'puzzle' | 'chessWin' | 'chessReview' | 'mystery'
  cap: number
} {
  switch (source) {
    case 'puzzle':       return { key: 'puzzle',       cap: AWARD_CAPS.puzzleDailyMax }
    case 'chess-win':    return { key: 'chessWin',     cap: AWARD_CAPS.chessWinDailyMax }
    case 'chess-review': return { key: 'chessReview',  cap: AWARD_CAPS.chessReviewDailyMax }
    case 'mystery':      return { key: 'mystery',      cap: AWARD_CAPS.mysteryDailyMax }
  }
}

function emptyEarn(dayKey: number): GuestDailyEarn {
  return { dayKey, puzzle: 0, chessWin: 0, chessReview: 0, mystery: 0 }
}

export const awardCastlePoints = onCall<AwardCastlePointsRequest, Promise<AwardCastlePointsResponse>>({ enforceAppCheck: true },
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
    const baseAmount = amountFor(award)
    if (baseAmount <= 0) {
      // Read once to return the current balance shape.
      const snap = await guestRef.get()
      if (!snap.exists) return { castlePoints: 0, added: 0, unlockedJustNow: false }
      const guest = snap.data() as GuestDoc
      return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
    }

    // Transactional read-modify-write: bucket may need to roll over to today
    // AND the award gets clamped against the daily cap atomically. Keeps two
    // concurrent puzzle solves from each blowing past the cap by 1.
    const { key: bucketKey, cap } = dailyCapFor(award.source)
    const todayKey = Math.floor(Date.now() / DAY_MS)
    const ip = extractIp(req)

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(guestRef)
      if (!snap.exists) {
        // Bypass guest or invalid name — silent no-op.
        return { castlePoints: 0, added: 0, unlockedJustNow: false }
      }
      const guest = snap.data() as GuestDoc
      if (!guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only earn points for yourself.')
      }

      const earn = guest.dailyEarn && guest.dailyEarn.dayKey === todayKey
        ? { ...guest.dailyEarn }
        : emptyEarn(todayKey)

      const headroom = Math.max(0, cap - (earn[bucketKey] ?? 0))
      const grantedAmount = Math.min(baseAmount, headroom)
      if (grantedAmount <= 0) {
        // Cap hit for the day; persist any bucket roll-over but don't add points.
        if (guest.dailyEarn?.dayKey !== todayKey) {
          tx.update(guestRef, { dailyEarn: earn })
        }
        return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
      }

      const before = guest.castlePoints
      const after = before + grantedAmount
      earn[bucketKey] = (earn[bucketKey] ?? 0) + grantedAmount
      const unlockedJustNow = before < UNLOCK_THRESHOLD && after >= UNLOCK_THRESHOLD

      // Lazy-migrate lifetimeEarned: if absent, seed from current balance
      // so existing guests don't start their title ladder from 0.
      const lifetimePrev = guest.lifetimeEarned ?? Math.max(0, before)
      const lifetimeAfter = lifetimePrev + grantedAmount

      tx.update(guestRef, {
        castlePoints: after,
        dailyEarn: earn,
        lifetimeEarned: lifetimeAfter,
      })
      const sourceLabel = award.source === 'chess-win' && award.opponent
        ? `award:chess-win:${award.opponent}`
        : `award:${award.source}`
      const metadata: Record<string, string | number | boolean> = {}
      if (award.source === 'puzzle') {
        metadata.puzzleId = award.puzzleId
        metadata.isFirstSolve = award.isFirstSolve
      } else if (award.source === 'chess-win' || award.source === 'chess-review') {
        metadata.gameId = award.gameId
      } else if (award.source === 'mystery') {
        metadata.mysteryId = award.mysteryId
      }
      appendAuditTx(tx, {
        normalizedName,
        uid,
        delta: grantedAmount,
        before,
        after,
        source: sourceLabel,
        metadata,
        ...(ip ? { ip } : {}),
      })
      return { castlePoints: after, added: grantedAmount, unlockedJustNow }
    })
  },
)
