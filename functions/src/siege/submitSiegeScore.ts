// submitSiegeScore — persist a Siege (chess tower defense) result for
// the global leaderboard. One doc per guest, `siege_scores/{name}`,
// holding the best per mode; it is only written when the run improves
// on what's stored. NO castle points — the Siege is a diversion.
//
// Mirrors submitForestScore: requires auth, the caller must be one of
// the guest's uids, and a missing guest (bypass) is a 200 no-op.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { GuestDoc } from '../castle/types'

const MAX_SCORE = 1_000_000
const MAX_WAVE = 999
const MAX_STARS = 36 // 12 maps × 3
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export type SiegeMode = 'endless' | 'daily' | 'campaign'

export interface SubmitSiegeScoreRequest {
  normalizedName: string
  mode: SiegeMode
  score: number
  wave: number
  dateKey?: string
  stars?: number
}
export interface SubmitSiegeScoreResponse {
  ok: true
  improved: boolean
}

export interface SiegeScoreDoc {
  normalizedName: string
  displayName: string
  endlessBest?: { score: number; wave: number }
  dailyBest?: { dateKey: string; score: number; wave: number }
  campaignStars?: number
  updatedAt: number
}

function clampInt(n: number, max: number): number {
  return Math.max(0, Math.min(max, Math.floor(n)))
}

export const submitSiegeScore = onCall<SubmitSiegeScoreRequest, Promise<SubmitSiegeScoreResponse>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in before submitting scores.')
    const uid = req.auth.uid
    const normalizedName = String(req.data?.normalizedName ?? '').trim().toLowerCase()
    const mode = req.data?.mode
    const rawScore = Number(req.data?.score)
    const rawWave = Number(req.data?.wave)

    if (!normalizedName) throw new HttpsError('invalid-argument', 'normalizedName required.')
    if (mode !== 'endless' && mode !== 'daily' && mode !== 'campaign') {
      throw new HttpsError('invalid-argument', 'mode must be endless, daily or campaign.')
    }
    if (!Number.isFinite(rawScore) || !Number.isFinite(rawWave)) {
      throw new HttpsError('invalid-argument', 'score and wave must be numbers.')
    }
    const score = clampInt(rawScore, MAX_SCORE)
    const wave = clampInt(rawWave, MAX_WAVE)

    let dateKey: string | undefined
    if (mode === 'daily') {
      dateKey = String(req.data?.dateKey ?? '')
      if (!DATE_KEY_RE.test(dateKey)) throw new HttpsError('invalid-argument', 'dateKey must be YYYY-MM-DD.')
    }
    let stars: number | undefined
    if (mode === 'campaign') {
      const rawStars = Number(req.data?.stars)
      if (!Number.isFinite(rawStars)) throw new HttpsError('invalid-argument', 'stars must be a number.')
      stars = clampInt(rawStars, MAX_STARS)
    }

    const db = getFirestore()
    const guestRef = db.doc(`guests/${normalizedName}`)
    const scoreRef = db.doc(`siege_scores/${normalizedName}`)
    const now = Date.now()

    return db.runTransaction(async (tx) => {
      const [guestSnap, scoreSnap] = await Promise.all([tx.get(guestRef), tx.get(scoreRef)])
      const guest = guestSnap.data() as GuestDoc | undefined
      if (!guest) {
        // Bypass guest snuck through — no-op.
        return { ok: true as const, improved: false }
      }
      if (!guest.uids.includes(uid)) {
        throw new HttpsError('permission-denied', 'You can only submit scores for yourself.')
      }

      const prior = scoreSnap.exists ? (scoreSnap.data() as SiegeScoreDoc) : undefined
      const patch: Partial<SiegeScoreDoc> = {}

      if (mode === 'endless') {
        if (!prior?.endlessBest || score > prior.endlessBest.score) patch.endlessBest = { score, wave }
      } else if (mode === 'daily' && dateKey) {
        // A new day always replaces; the same day only on improvement.
        if (!prior?.dailyBest || prior.dailyBest.dateKey !== dateKey || score > prior.dailyBest.score) {
          patch.dailyBest = { dateKey, score, wave }
        }
      } else if (mode === 'campaign' && stars !== undefined) {
        if (stars > (prior?.campaignStars ?? 0)) patch.campaignStars = stars
      }

      const improved = Object.keys(patch).length > 0
      if (improved) {
        tx.set(
          scoreRef,
          {
            normalizedName,
            displayName: guest.displayName,
            ...patch,
            updatedAt: now,
          },
          { merge: true },
        )
      }
      return { ok: true as const, improved }
    })
  },
)
