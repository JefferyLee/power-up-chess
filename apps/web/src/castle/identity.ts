// Castle identity — the name+magic-word layer on top of Anonymous Auth.
//
// Persisted in sessionStorage so a refresh keeps the guest signed in, but
// opening a new tab re-rolls the host and re-asks for name. Three concerns
// live here:
//   1. The session host (Lucy or Luca), rolled once and sticky.
//   2. The castle identity (displayName, normalizedName, castlePoints,
//      isBypass) — written after a successful castleEnter or castleBypass.
//   3. The client-side magic-word hash, so the network never sees plaintext.

const IDENTITY_KEY = 'puc:castle-identity:v1'

export interface CastleIdentity {
  displayName: string
  /** Lowercased + trimmed name used as the Firestore key. */
  normalizedName: string
  castlePoints: number
  /** True when this guest used the 3-strike bypass — no Firestore record,
   *  no points, no leaderboard. Throwaway for this tab only. */
  isBypass: boolean
  /** True if this is a new guest (just registered), false if returning.
   *  Drives the welcome line in the Hall. */
  isFirstVisit: boolean
  /** H.7 — auth session token minted by castleEnter. Stamped on every
   *  server call so an older device for this account gets evicted when
   *  a new sign-in happens elsewhere. Undefined for bypass guests. */
  sessionId?: string
  /** Populated when the last castleEnter applied decay (§7.4). The Hall
   *  shows a one-time welcome message and then clears this field via
   *  the context's `clearDecayInfo` callback. */
  lastDecay?: { decayedBy: number; pointsBefore: number }
  /** Phase C bonus on this visit: starter + check-in + streak. The Hall
   *  shows a toast and then clears via the same flow as lastDecay. */
  lastBonus?: {
    starter?: number
    checkIn?: number
    streak?: number
    streakDays?: number
    total: number
  }
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Hash for the magic word. SHA-256 of `normalizedName + ':' + magicWord`.
 *  Deliberately weak by password-hashing standards — see MVP2_PLAN.md §5.1.
 *  Uses the Web Crypto API; returns a lowercase hex digest. */
export async function hashMagicWord(name: string, magicWord: string): Promise<string> {
  const input = `${normalizeName(name)}:${magicWord}`
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function loadIdentity(): CastleIdentity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CastleIdentity>
    if (typeof parsed.displayName !== 'string' || parsed.displayName.length === 0) return null
    if (typeof parsed.normalizedName !== 'string' || parsed.normalizedName.length === 0) return null
    const lastDecay = parsed.lastDecay
    const lastBonus = parsed.lastBonus
    return {
      displayName: parsed.displayName,
      normalizedName: parsed.normalizedName,
      castlePoints: typeof parsed.castlePoints === 'number' && parsed.castlePoints >= 0 ? parsed.castlePoints : 0,
      isBypass: parsed.isBypass === true,
      isFirstVisit: parsed.isFirstVisit === true,
      ...(lastDecay && typeof lastDecay.decayedBy === 'number' && typeof lastDecay.pointsBefore === 'number'
        ? { lastDecay: { decayedBy: lastDecay.decayedBy, pointsBefore: lastDecay.pointsBefore } }
        : {}),
      ...(lastBonus && typeof lastBonus.total === 'number' && lastBonus.total > 0
        ? { lastBonus: { ...lastBonus, total: lastBonus.total } }
        : {}),
      ...(typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0
        ? { sessionId: parsed.sessionId }
        : {}),
    }
  } catch {
    return null
  }
}

export function saveIdentity(identity: CastleIdentity): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // Quota / privacy mode — ignore.
  }
}

export function clearIdentity(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(IDENTITY_KEY)
  } catch {
    // Ignore.
  }
}

/** Generate a throwaway display name for the bypass path. Format: Guest-1234. */
export function generateBypassName(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `Guest-${n}`
}
