// settleAward — the one place a game-type castle-point award is paid:
// the amount per AWARD_CAPS, the per-source daily bucket, the
// once-per-event marker (castle_point_awards/{name}_{source}_{eventId})
// and the audit row, all inside the caller's transaction.
//
// Callers (2026-10-12, server-settled wins): awardCastlePoints for the
// client-claimed sources (puzzle, review, mystery), syncDeviceGame for
// Local / AI wins when the game is recorded, onRoomFinished for online
// wins. It reads the marker with tx.get(), so call it before any write
// in the same transaction.

import type { Firestore, Transaction } from 'firebase-admin/firestore'
import {
  AWARD_CAPS,
  UNLOCK_THRESHOLD,
  type AwardCastlePointsResponse,
  type AwardSource,
  type GuestDailyEarn,
  type GuestDoc,
} from './types'
import { appendAuditTx } from './audit'

const DAY_MS = 24 * 60 * 60 * 1000

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)))
}

/** Resolve the source-tagged award to a final integer amount. */
export function amountFor(award: AwardSource): number {
  switch (award.source) {
    case 'puzzle': {
      const base = clamp(award.scorePoints, AWARD_CAPS.puzzleMin, AWARD_CAPS.puzzleMax)
      return base + (award.isFirstSolve ? AWARD_CAPS.puzzleFirstSolveBonus : 0)
    }
    case 'chess-win': {
      // The opponent tier scales the win; no tier = the legacy flat rate.
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

/** The event an award is paid for — the key it is deduped on. Null for
 *  sources without a per-event identity (puzzle re-solves pay by design,
 *  the mystery riddle rotates; both lean on their daily caps alone). */
export function eventIdFor(award: AwardSource): string | null {
  switch (award.source) {
    case 'chess-win':
    case 'chess-review':
      return String(award.gameId ?? '').trim()
    default:
      return null
  }
}

export interface SettledBy {
  /** Auth uid behind the award; null for a server-initiated settlement. */
  uid: string | null
  ip?: string
}

/** Pay `award` to `normalizedName` inside `tx`. `guest` is the doc as
 *  read in this transaction. Returns the new balance and what was added
 *  (0 when already paid, capped for the day, or worth nothing). */
export async function settleAwardTx(
  tx: Transaction,
  db: Firestore,
  normalizedName: string,
  guest: GuestDoc,
  award: AwardSource,
  by: SettledBy,
): Promise<AwardCastlePointsResponse> {
  const baseAmount = amountFor(award)
  if (baseAmount <= 0) {
    return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
  }
  const eventId = eventIdFor(award)
  const paidRef = eventId === null
    ? null
    : db.doc(`castle_point_awards/${normalizedName}_${award.source}_${eventId}`)
  const paidSnap = paidRef ? await tx.get(paidRef) : null
  if (paidSnap?.exists) {
    // Same game settled before (retry, double-fire, replay): paid once.
    return { castlePoints: guest.castlePoints, added: 0, unlockedJustNow: false }
  }

  // Bucket may need to roll over to today AND the award gets clamped
  // against the daily cap atomically, so two concurrent awards can't each
  // blow past the cap by one.
  const { key: bucketKey, cap } = dailyCapFor(award.source)
  const todayKey = Math.floor(Date.now() / DAY_MS)
  const guestRef = db.doc(`guests/${normalizedName}`)
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
  if (paidRef) {
    tx.create(paidRef, { normalizedName, source: award.source, delta: grantedAmount, serverTs: Date.now() })
  }
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
    uid: by.uid,
    delta: grantedAmount,
    before,
    after,
    source: sourceLabel,
    metadata,
    ...(by.ip ? { ip: by.ip } : {}),
  })
  return { castlePoints: after, added: grantedAmount, unlockedJustNow }
}
