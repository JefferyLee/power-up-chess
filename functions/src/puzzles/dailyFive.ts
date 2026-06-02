// Today's Five — daily quest of 5 puzzles, deterministic per (kid, LA-day).
//
// Mix: 3 at-level, 1 stretch (+100), 1 reach (+200), across all 6 plots
// chosen by a sha256 hash of (normalizedName + dayKey + slot). The set
// rolls over at LA midnight; results carry across re-visits within the
// same day.
//
// Bypass guests don't have a guest doc → no daily five for them.

import { createHash } from 'node:crypto'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'
import {
  DEFAULT_RATING,
  PLOTS,
  type Plot,
  type PuzzleDoc,
} from './types'

const PROJECT_TZ = 'America/Los_Angeles'
const DAILY_BONUS_POINTS = 10

interface SlotSpec {
  ratingOffset: number      // ± from the kid's plot rating
  plot: Plot                // forced via the hash below
}

/** 5 slots, ramped easy → hard. plot picked by hash at request time. */
const SLOT_SHAPE: number[] = [-100, 0, 0, 100, 200]

export interface GetDailyFiveRequest {
  normalizedName: string
}

export type GetDailyFiveResponse =
  | {
      ok: true
      dayKey: string
      puzzles: PuzzleDoc[]
      /** Per-slot status: true=solved, false=failed/skipped, null=pending. */
      results: Array<boolean | null>
      completionBonusPaid: boolean
    }
  | { ok: false; reason: 'invalid-input' | 'empty' }

export const getDailyFive = onCall<
  GetDailyFiveRequest,
  Promise<GetDailyFiveResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  if (!normalizedName) return { ok: false, reason: 'invalid-input' }

  const db = getFirestore()
  const guestRef = db.doc(`guests/${normalizedName}`)
  const guestSnap = await guestRef.get()
  const guest = guestSnap.data() as GuestDoc | undefined
  if (!guest || !guest.uids.includes(req.auth.uid)) {
    throw new HttpsError('permission-denied', 'Sign in as yourself.')
  }

  const dayKey = laDayKey(Date.now())

  // Same day → return what we already picked.
  if (
    guest.puzzleDaily &&
    guest.puzzleDaily.dayKey === dayKey &&
    guest.puzzleDaily.puzzleIds.length === SLOT_SHAPE.length
  ) {
    const fetched = await Promise.all(
      guest.puzzleDaily.puzzleIds.map((id) =>
        db.doc(`puzzles/${id}`).get(),
      ),
    )
    const puzzles: PuzzleDoc[] = []
    for (const s of fetched) {
      const d = s.data() as PuzzleDoc | undefined
      if (!d) return { ok: false, reason: 'empty' }
      puzzles.push(d)
    }
    return {
      ok: true,
      dayKey,
      puzzles,
      results: guest.puzzleDaily.results,
      completionBonusPaid: guest.puzzleDaily.completionBonusPaid === true,
    }
  }

  // New day — pick 5 puzzles.
  const ratings = guest.puzzleRatings ?? {}
  const picks: PuzzleDoc[] = []
  for (let i = 0; i < SLOT_SHAPE.length; i++) {
    const slot: SlotSpec = {
      ratingOffset: SLOT_SHAPE[i]!,
      plot: PLOTS[hashIdx(normalizedName, dayKey, i, PLOTS.length)]!,
    }
    const baseRating = ratings[slot.plot] ?? DEFAULT_RATING
    const targetRating = clamp(baseRating + slot.ratingOffset, 200, 3000)
    const picked = await pickPuzzleNear(db, slot.plot, targetRating, normalizedName, dayKey, i)
    if (!picked) return { ok: false, reason: 'empty' }
    picks.push(picked)
  }

  // Persist the picks so subsequent reads (and the submit-attempt hook)
  // can find them.
  await guestRef.update({
    puzzleDaily: {
      dayKey,
      puzzleIds: picks.map((p) => p.id),
      results: new Array(SLOT_SHAPE.length).fill(null) as Array<boolean | null>,
      completionBonusPaid: false,
    },
  })

  return {
    ok: true,
    dayKey,
    puzzles: picks,
    results: new Array(SLOT_SHAPE.length).fill(null) as Array<boolean | null>,
    completionBonusPaid: false,
  }
})

const FETCH_WINDOW = 30

async function pickPuzzleNear(
  db: FirebaseFirestore.Firestore,
  plot: Plot,
  targetRating: number,
  normalizedName: string,
  dayKey: string,
  slot: number,
): Promise<PuzzleDoc | null> {
  // Look in [target-75, target+75]; widen on miss.
  for (const half of [75, 150, 300]) {
    const lo = Math.max(200, targetRating - half)
    const hi = Math.min(3000, targetRating + half)
    const snap = await db
      .collection('puzzles')
      .where('plot', '==', plot)
      .where('legends', '==', false)
      .where('difficulty', '>=', lo)
      .where('difficulty', '<=', hi)
      .orderBy('difficulty')
      .limit(FETCH_WINDOW)
      .get()
    const docs = snap.docs.map((d) => d.data() as PuzzleDoc)
    if (docs.length === 0) continue
    const idx = hashIdx(normalizedName, dayKey, slot, docs.length)
    return docs[idx]!
  }
  return null
}

/** Pure deterministic 32-bit hash → bucket. */
function hashIdx(
  normalizedName: string,
  dayKey: string,
  slot: number,
  modulo: number,
): number {
  const h = createHash('sha256')
    .update(`${normalizedName}|${dayKey}|${slot}`)
    .digest()
  // Read first 4 bytes as uint32.
  const n = h.readUInt32BE(0)
  return n % modulo
}

/** Returns the calendar day in LA as YYYY-MM-DD. */
export function laDayKey(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROJECT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs))
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

export { DAILY_BONUS_POINTS }

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
