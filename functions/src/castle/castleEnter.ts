// castleEnter — look up a guest by name and verify their magic word hash.
//
// Three possible outcomes:
//   new          — name not yet taken, register and return castlePoints=0.
//   returning    — name+hash matches an existing guest, return their points.
//   wrong-magic  — name exists but hash differs, count toward 3-strike.
//
// Rate limiting is enforced per Anonymous Auth uid using
// `castle_enter_attempts/{uid}` (10 / min, 50 / day per uid). The 3-strike
// counter is tracked on the same doc so the client can't lie about how many
// times it's been wrong.

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  AWARD_CAPS,
  type CastleEnterRequest,
  type CastleEnterResponse,
  type EnterAttemptsDoc,
  type EnterBonus,
  type EnterCosmetics,
  type GuestCosmetics,
  type GuestDoc,
} from './types'
import { applyDecay } from './decay'
import { scrubMessage } from './profanity'
import { extractIp, hashIp, lookupGeo, type GeoResult } from './ipGeo'
import { appendAudit } from './audit'

const NAME_MIN = 1
const NAME_MAX = 20
const HASH_LENGTH = 64 // hex sha256

const MAX_ATTEMPTS_PER_MINUTE = 10
const MAX_ATTEMPTS_PER_DAY = 50
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export function sanitizeDisplayName(name: string): string {
  // Strip control chars + clamp to NAME_MAX. Allow Unicode letters/emoji.
  // eslint-disable-next-line no-control-regex
  const stripped = name.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return stripped.slice(0, NAME_MAX)
}

export const castleEnter = onCall<CastleEnterRequest, Promise<CastleEnterResponse>>({ enforceAppCheck: false },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before entering the castle.')
    }
    const uid = req.auth.uid
    const rawName = String(req.data?.name ?? '')
    const hash = String(req.data?.hash ?? '')
    const displayName = sanitizeDisplayName(rawName)
    const normalizedName = normalize(rawName)

    if (displayName.length < NAME_MIN || displayName.length > NAME_MAX || normalizedName.length === 0) {
      return { status: 'invalid-input', reason: `Name must be ${NAME_MIN}–${NAME_MAX} characters.` }
    }
    if (!/^[0-9a-f]+$/i.test(hash) || hash.length !== HASH_LENGTH) {
      return { status: 'invalid-input', reason: 'Magic word hash is malformed.' }
    }

    const db = getFirestore()
    const now = Date.now()

    // Origin tracking — kick off the geo lookup in parallel with the
    // rest of the work so the network call doesn't add to wall time.
    // Both the hash and the geo result are nullable; a failed lookup
    // just leaves the fields untouched on the guest doc.
    const ip = extractIp(req)
    const ipHash = ip ? hashIp(ip) : null
    const geoPromise: Promise<GeoResult | null> = ip ? lookupGeo(ip) : Promise.resolve(null)

    // Rate-limit check before any other work.
    const attemptsRef = db.doc(`castle_enter_attempts/${uid}`)
    const attemptsSnap = await attemptsRef.get()
    const attempts = (attemptsSnap.data() as EnterAttemptsDoc | undefined) ?? {
      consecutiveWrong: 0,
      totalInWindow: 0,
      windowStart: now,
      blockedUntil: 0,
    }

    if (attempts.blockedUntil > now) {
      return { status: 'rate-limited', retryAfterMs: attempts.blockedUntil - now }
    }

    // Roll the 1-minute window.
    const roll = rollEnterWindow(attempts, now)
    const nextWindowStart = roll.windowStart
    const nextTotal = roll.totalInWindow

    if (roll.blockedUntil !== undefined) {
      const blockedUntil = roll.blockedUntil
      await attemptsRef.set({
        ...attempts,
        windowStart: nextWindowStart,
        totalInWindow: nextTotal,
        blockedUntil,
      } satisfies EnterAttemptsDoc)
      return { status: 'rate-limited', retryAfterMs: blockedUntil - now }
    }

    // Daily cap — a separate counter would be cleaner but for MVP we just
    // log per-day attempts using the windowStart as a coarse proxy: if the
    // doc is older than a day, reset.
    const dayKey = Math.floor(now / DAY_MS)
    const dailyRef = db.doc(`castle_enter_attempts_daily/${uid}_${dayKey}`)
    const dailySnap = await dailyRef.get()
    const dailyCount = (dailySnap.data()?.count as number | undefined) ?? 0
    if (dailyCount >= MAX_ATTEMPTS_PER_DAY) {
      return { status: 'rate-limited', retryAfterMs: DAY_MS - (now % DAY_MS) }
    }

    // Phase 3.5 — per-NAME window on top of the per-uid one: a distributed
    // guesser rotating anonymous uids against one nickname still hits this.
    const nameAttemptsRef = db.doc(`castle_enter_attempts_byname/${normalizedName}`)
    const nameSnap = await nameAttemptsRef.get()
    const nameAttempts = (nameSnap.data() as { windowStart: number; totalInWindow: number } | undefined)
      ?? { windowStart: now, totalInWindow: 0 }
    const nameRoll = rollEnterWindow(nameAttempts, now)
    await nameAttemptsRef.set({ windowStart: nameRoll.windowStart, totalInWindow: nameRoll.totalInWindow })
    if (nameRoll.blockedUntil !== undefined) {
      return { status: 'rate-limited', retryAfterMs: nameRoll.blockedUntil - now }
    }

    // Look up the guest doc.
    const guestRef = db.doc(`guests/${normalizedName}`)
    const guestSnap = await guestRef.get()
    const existing = guestSnap.data() as GuestDoc | undefined

    let result: CastleEnterResponse
    let nextConsecutiveWrong: number

    if (!existing) {
      // New guest — the name itself passes the chat scrub (Phase 1.4):
      // profane or severe names can't be registered in the first place.
      // Only enforced at registration so wordlist updates never lock out
      // an existing guest's stored name.
      const nameScrub = scrubMessage(displayName)
      if (nameScrub.reject || nameScrub.censored) {
        return { status: 'invalid-input', reason: 'Please pick a friendlier name.' }
      }
      // Register + starter pack.
      const starter = AWARD_CAPS.newAccountStarter
      const todayKey = Math.floor(now / DAY_MS)
      const sessionId = mintSessionId()
      const geo = await geoPromise
      const doc: GuestDoc = {
        displayName,
        normalizedName,
        magicWordHash: hash,
        uids: [uid],
        castlePoints: starter,
        createdAt: now,
        lastVisitAt: now,
        lastCheckInDayKey: todayKey,
        streakDays: 1,
        lifetimeEarned: starter,
        activeSessionId: sessionId,
        ...(geo?.country ? { firstCountry: geo.country, recentCountry: geo.country } : {}),
        ...(geo?.city ? { firstCity: geo.city, recentCity: geo.city } : {}),
        ...(ip ? { firstIp: ip, recentIp: ip } : {}),
        ...(ipHash ? { firstIpHash: ipHash, recentIpHash: ipHash } : {}),
      }
      await guestRef.create(doc)
      // Ledger entry for the starter pack. New-account event is logged
      // even though castleEnter isn't transactional — the rate limiter
      // upstream caps concurrent calls per uid so dup-firing is rare,
      // and the ledger is informational, not a balance-of-truth.
      await appendAudit({
        normalizedName,
        uid,
        delta: starter,
        before: 0,
        after: starter,
        source: 'castleEnter:starter',
        ...(ip ? { ip } : {}),
      })
      nextConsecutiveWrong = 0
      const bonus: EnterBonus = { starter, total: starter }
      result = {
        status: 'new',
        displayName,
        castlePoints: starter,
        decayedBy: 0,
        pointsBeforeDecay: 0,
        bonus,
        sessionId,
        // New guest has no cosmetics yet; omitted so the client falls
        // through to its default piece-set.
      }
    } else if (existing.magicWordHash === hash) {
      // Returning guest — apply decay first, then daily check-in + streak bonuses.
      const { castlePoints: postDecay, decayedBy } = applyDecay(
        existing.castlePoints,
        existing.lastVisitAt,
        now,
      )
      const bonus = computeEnterBonus(existing, now)
      const finalPoints = postDecay + bonus.total
      const sessionId = mintSessionId()
      const updates: Partial<GuestDoc> = { lastVisitAt: now, activeSessionId: sessionId }
      if (decayedBy > 0 || bonus.total > 0) updates.castlePoints = finalPoints
      if (bonus.checkIn !== undefined || bonus.streak !== undefined) {
        updates.lastCheckInDayKey = Math.floor(now / DAY_MS)
        updates.streakDays = bonus.streakDays
      }
      if (!existing.uids.includes(uid)) {
        updates.uids = [...existing.uids, uid].slice(-10) // cap at 10 devices
      }
      if (bonus.total > 0) {
        // Phase D — bonuses count toward lifetime earn (titles only go up).
        // Lazy-migrate the field for guests pre-existing before Phase D.
        const lifetimePrev = existing.lifetimeEarned ?? Math.max(0, existing.castlePoints)
        updates.lifetimeEarned = lifetimePrev + bonus.total
      }
      // Origin tracking — refresh recent*, lazily backfill first* on
      // accounts that pre-date this feature (createdAt is what it is,
      // so the best signal we have for those is "wherever they were on
      // the next visit after the feature shipped").
      const geo = await geoPromise
      if (geo?.country) updates.recentCountry = geo.country
      if (geo?.city) updates.recentCity = geo.city
      if (ip) updates.recentIp = ip
      if (ipHash) updates.recentIpHash = ipHash
      if (!existing.firstCountry && geo?.country) updates.firstCountry = geo.country
      if (!existing.firstCity && geo?.city) updates.firstCity = geo.city
      if (!existing.firstIp && ip) updates.firstIp = ip
      if (!existing.firstIpHash && ipHash) updates.firstIpHash = ipHash
      await guestRef.update(updates)
      // Ledger entries for the returning-guest path. Decay and the
      // check-in / streak bonus are logged separately so the trail
      // reads cleanly: "lost 5 to decay, then earned 22 from check-in
      // + streak". Each entry stamps the running balance so reading
      // the ledger top-to-bottom reconstructs every state transition.
      if (decayedBy > 0) {
        await appendAudit({
          normalizedName,
          uid,
          delta: -decayedBy,
          before: existing.castlePoints,
          after: postDecay,
          source: 'castleEnter:decay',
          ...(ip ? { ip } : {}),
        })
      }
      if (bonus.total > 0) {
        await appendAudit({
          normalizedName,
          uid,
          delta: bonus.total,
          before: postDecay,
          after: finalPoints,
          source: bonus.streak ? 'castleEnter:streak' : 'castleEnter:check-in',
          metadata: {
            ...(bonus.checkIn ? { checkIn: bonus.checkIn } : {}),
            ...(bonus.streak ? { streak: bonus.streak } : {}),
            ...(typeof bonus.streakDays === 'number' ? { streakDays: bonus.streakDays } : {}),
          },
          ...(ip ? { ip } : {}),
        })
      }
      nextConsecutiveWrong = 0
      const cosmetics = projectCosmetics(existing.cosmetics)
      result = {
        status: 'returning',
        displayName: existing.displayName,
        castlePoints: finalPoints,
        decayedBy,
        pointsBeforeDecay: existing.castlePoints,
        ...(bonus.total > 0 ? { bonus } : {}),
        sessionId,
        ...(cosmetics ? { cosmetics } : {}),
      }
    } else {
      // Wrong magic.
      const strike = wrongMagicStrike(attempts.consecutiveWrong)
      nextConsecutiveWrong = strike.nextConsecutiveWrong
      result = { status: 'wrong-magic', attemptsRemaining: strike.attemptsRemaining }
    }

    // Persist the attempts state + daily counter.
    await attemptsRef.set({
      consecutiveWrong: nextConsecutiveWrong,
      totalInWindow: nextTotal,
      windowStart: nextWindowStart,
      blockedUntil: 0,
    } satisfies EnterAttemptsDoc)
    await dailyRef.set({ count: FieldValue.increment(1) }, { merge: true })

    return result
  },
)

/** Pull the pieces of cosmetic state the client cares about for the
 *  first frame after sign-in. Halo / crown / tournament flags are
 *  expiry-timestamps on the guest doc; the client recomputes those
 *  from presence anyway, so we only ship the equipped + owned ids. */
function projectCosmetics(c: GuestCosmetics | undefined): EnterCosmetics | null {
  if (!c) return null
  const out: EnterCosmetics = {}
  if (typeof c.pieceSet === 'string' && c.pieceSet) out.pieceSet = c.pieceSet
  if (Array.isArray(c.ownedPieceSets) && c.ownedPieceSets.length > 0) {
    out.ownedPieceSets = [...c.ownedPieceSets]
  }
  if (c.avatar && typeof c.avatar === 'object') out.avatar = c.avatar
  return out.pieceSet || out.ownedPieceSets || out.avatar ? out : null
}

/** 12-char random base36 session token — short enough to URL-safe in
 *  every header, long enough to be unguessable. Re-minted on every
 *  castleEnter so older devices are evicted on the next heartbeat. */
function mintSessionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

/** Decide which Phase-C bonuses fire on a returning guest's visit:
 *  • daily check-in (first visit of the calendar day → +2)
 *  • streak bonus (every 7th consecutive day → +20)
 *
 *  Streak rule: dayKey delta of 1 continues; 0 means already claimed today;
 *  anything ≥ 2 resets the streak to 1. Same-day re-entries are bonus-free
 *  to keep the system honest. */
export function computeEnterBonus(existing: GuestDoc, now: number): EnterBonus {
  const todayKey = Math.floor(now / DAY_MS)
  const lastKey = existing.lastCheckInDayKey ?? -Infinity
  const delta = todayKey - lastKey
  if (delta <= 0) {
    return { total: 0 }
  }
  const prevStreak = existing.streakDays ?? 0
  const nextStreak = delta === 1 ? prevStreak + 1 : 1
  const checkIn = AWARD_CAPS.checkInDaily
  const isStreakHit = nextStreak > 0 && nextStreak % AWARD_CAPS.streakDaysRequired === 0
  const streak = isStreakHit ? AWARD_CAPS.streakBonus : 0
  return {
    checkIn,
    ...(streak > 0 ? { streak } : {}),
    streakDays: nextStreak,
    total: checkIn + streak,
  }
}

/** Pure per-minute window roll for castleEnter rate limiting (Phase 0.5).
 *  Counts this attempt; `blockedUntil` is set when it exceeds the cap. */
export function rollEnterWindow(
  attempts: Pick<EnterAttemptsDoc, 'windowStart' | 'totalInWindow'>,
  now: number,
): { windowStart: number; totalInWindow: number; blockedUntil?: number } {
  const fresh = now - attempts.windowStart < MINUTE_MS
  const windowStart = fresh ? attempts.windowStart : now
  const totalInWindow = fresh ? attempts.totalInWindow + 1 : 1
  if (totalInWindow > MAX_ATTEMPTS_PER_MINUTE) {
    return { windowStart, totalInWindow, blockedUntil: windowStart + MINUTE_MS }
  }
  return { windowStart, totalInWindow }
}

/** Pure 3-strike arithmetic for a wrong magic word (Phase 0.5). */
export function wrongMagicStrike(prevConsecutiveWrong: number): {
  nextConsecutiveWrong: number
  attemptsRemaining: number
} {
  const nextConsecutiveWrong = prevConsecutiveWrong + 1
  return { nextConsecutiveWrong, attemptsRemaining: Math.max(0, 3 - nextConsecutiveWrong) }
}
