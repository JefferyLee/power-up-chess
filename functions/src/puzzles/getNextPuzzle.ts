// getNextPuzzle — serve one puzzle for a given plot, near the kid's
// current per-plot rating, that they haven't seen recently.
//
// Pulls a small window of candidates by (plot, legends=false, difficulty
// in [r-100, r+100]), filters out anything in the guest's seen list,
// picks one at random. If the window is empty we widen progressively
// before giving up — better to repeat a recent puzzle than serve nothing.
//
// Bypass guests get served too (their per-plot rating defaults to
// DEFAULT_RATING and we just don't persist a seen-set for them).

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { findOwnedGuest } from '../castle/requireOwner'
import {
  DEFAULT_RATING,
  PLOTS,
  RATING_MAX,
  RATING_MIN,
  SERVE_WINDOW,
  type GetNextPuzzleRequest,
  type GetNextPuzzleResponse,
  type Plot,
  type PuzzleDoc,
} from './types'

const CANDIDATE_FETCH = 30          // pull this many before filtering
const WIDENING_STEPS = [0, 1, 2, 3] // multipliers on SERVE_WINDOW when widening

export const getNextPuzzle = onCall<
  GetNextPuzzleRequest,
  Promise<GetNextPuzzleResponse>
>(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')

  const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
  const plot = req.data?.plot
  const ratingOverride = req.data?.ratingOverride

  if (!plot || !PLOTS.includes(plot as Plot)) {
    return { ok: false, reason: 'invalid-input' }
  }

  const db = getFirestore()

  // Resolve the kid's plot rating + recently-seen set. Bypass guests
  // (no doc) just get DEFAULT_RATING with an empty seen list.
  let playerRating = DEFAULT_RATING
  let seen: Set<string> = new Set()
  if (normalizedName) {
    const owned = await findOwnedGuest(db, req.auth.uid, normalizedName)
    if (owned) {
      playerRating = owned.guest.puzzleRatings?.[plot as Plot] ?? DEFAULT_RATING
      seen = new Set(owned.guest.puzzleSeen ?? [])
    }
  }
  if (typeof ratingOverride === 'number' && Number.isFinite(ratingOverride)) {
    playerRating = clamp(ratingOverride, RATING_MIN, RATING_MAX)
  }

  // Progressive widening — start with ±SERVE_WINDOW, expand if no
  // unseen candidates surface.
  for (const step of WIDENING_STEPS) {
    const lo = Math.max(RATING_MIN, playerRating - SERVE_WINDOW * (step + 1))
    const hi = Math.min(RATING_MAX, playerRating + SERVE_WINDOW * (step + 1))
    const candidate = await pickCandidate(db, plot as Plot, lo, hi, seen)
    if (candidate) {
      return { ok: true, puzzle: candidate, playerRating }
    }
  }

  // Last resort — serve a known-seen puzzle rather than empty. The kid
  // has clearly exhausted the band so a repeat is fine.
  const fallback = await pickCandidate(db, plot as Plot, RATING_MIN, RATING_MAX, new Set())
  if (fallback) {
    return { ok: true, puzzle: fallback, playerRating }
  }
  return { ok: false, reason: 'empty' }
})

async function pickCandidate(
  db: FirebaseFirestore.Firestore,
  plot: Plot,
  loRating: number,
  hiRating: number,
  seen: Set<string>,
): Promise<PuzzleDoc | null> {
  // Firestore can't ORDER BY RAND(). Trick: pick a random rating inside
  // the band, fetch CANDIDATE_FETCH puzzles starting from there. If the
  // tail of the band returns nothing, wrap to the band start.
  const pivot = loRating + Math.floor(Math.random() * Math.max(1, hiRating - loRating + 1))

  const first = await db
    .collection('puzzles')
    .where('plot', '==', plot)
    .where('legends', '==', false)
    .where('difficulty', '>=', pivot)
    .where('difficulty', '<=', hiRating)
    .orderBy('difficulty')
    .limit(CANDIDATE_FETCH)
    .get()
  const unseenFromPivot = first.docs
    .map((d) => d.data() as PuzzleDoc)
    .filter((p) => !seen.has(p.id))
  if (unseenFromPivot.length > 0) {
    return unseenFromPivot[Math.floor(Math.random() * unseenFromPivot.length)]!
  }

  // Wrap-around fetch from the bottom of the band.
  if (pivot > loRating) {
    const wrap = await db
      .collection('puzzles')
      .where('plot', '==', plot)
      .where('legends', '==', false)
      .where('difficulty', '>=', loRating)
      .where('difficulty', '<', pivot)
      .orderBy('difficulty')
      .limit(CANDIDATE_FETCH)
      .get()
    const unseenFromWrap = wrap.docs
      .map((d) => d.data() as PuzzleDoc)
      .filter((p) => !seen.has(p.id))
    if (unseenFromWrap.length > 0) {
      return unseenFromWrap[Math.floor(Math.random() * unseenFromWrap.length)]!
    }
  }
  return null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
