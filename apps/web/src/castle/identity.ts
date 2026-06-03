// Castle identity — the name+magic-word layer on top of Anonymous Auth.
//
// Persisted in localStorage with a 5-day sliding TTL so a returning guest
// on the same device doesn't have to re-type their magic word. The wicket
// uses the stored credential to re-call castleEnter behind a "Welcome back"
// confirmation. Threat model unchanged: the magic word is sha256-only by
// spec (see MVP2_PLAN.md §5.1), the Firebase anon UID is already in
// localStorage, and the server-side sessionId still evicts older devices
// when the account signs in elsewhere.

const IDENTITY_KEY = 'puc:castle-identity:v2'
const TTL_MS = 5 * 24 * 60 * 60 * 1000  // 5 days

interface StoredAccount {
  savedAt: number
  /** Absent after a normal sign-out — credential alone is enough to drive
   *  the wicket's "Welcome back" path on the next visit. */
  identity?: CastleIdentity
  /** Cached magic-word credential for "quick re-enter" on the wicket.
   *  Absent for bypass guests (no Firestore record, no quick-enter) and
   *  cleared by the "Not me?" link on the wicket. */
  credential?: CastleCredential
}

export interface CastleCredential {
  /** The exact displayName as accepted by the server (case + trimming). */
  displayName: string
  /** sha256(`${normalizedName}:${magicWord}`), same value we send to
   *  castleEnter on first sign-in. */
  hash: string
}

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
  /** P1.D — local cosmetics selection. Server-side mirror lands in the
   *  next slice; for now this is sessionStorage-only. */
  cosmetics?: {
    /** PieceSetId, kept as a plain string here so a stale stored value
     *  from a future client doesn't crash older builds — see
     *  cosmetics/pieceSets.ts `getPieceSet` which defaults unknown ids. */
    pieceSet?: string
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

function readStored(): StoredAccount | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const wrapper = JSON.parse(raw) as Partial<StoredAccount>
    if (typeof wrapper.savedAt !== 'number' || Date.now() - wrapper.savedAt > TTL_MS) {
      window.localStorage.removeItem(IDENTITY_KEY)
      return null
    }
    // Parse identity if present + valid; otherwise the wrapper may still
    // carry a credential (post-sign-out state) and we shouldn't bail.
    const parsed = wrapper.identity as Partial<CastleIdentity> | undefined
    let identity: CastleIdentity | undefined
    if (
      parsed &&
      typeof parsed.displayName === 'string' &&
      parsed.displayName.length > 0 &&
      typeof parsed.normalizedName === 'string' &&
      parsed.normalizedName.length > 0
    ) {
      const lastDecay = parsed.lastDecay
      const lastBonus = parsed.lastBonus
      identity = {
        displayName: parsed.displayName,
        normalizedName: parsed.normalizedName,
        castlePoints:
          typeof parsed.castlePoints === 'number' && parsed.castlePoints >= 0 ? parsed.castlePoints : 0,
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
        ...(parsed.cosmetics &&
        typeof parsed.cosmetics === 'object' &&
        typeof parsed.cosmetics.pieceSet === 'string'
          ? { cosmetics: { pieceSet: parsed.cosmetics.pieceSet } }
          : {}),
      }
    }
    const cred = wrapper.credential
    const credential: CastleCredential | undefined =
      cred && typeof cred.displayName === 'string' && typeof cred.hash === 'string' && cred.hash.length > 0
        ? { displayName: cred.displayName, hash: cred.hash }
        : undefined
    if (!identity && !credential) return null
    return {
      savedAt: wrapper.savedAt,
      ...(identity ? { identity } : {}),
      ...(credential ? { credential } : {}),
    }
  } catch {
    return null
  }
}

function writeStored(account: StoredAccount): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(account))
  } catch {
    // Quota / privacy mode — ignore.
  }
}

export function loadIdentity(): CastleIdentity | null {
  return readStored()?.identity ?? null
}

/** Returns the cached credential if it's still within TTL. Used by the
 *  wicket to render the "Welcome back, X" path. */
export function loadCredential(): CastleCredential | null {
  return readStored()?.credential ?? null
}

/** Save identity, refreshing the TTL window. Preserves any existing
 *  cached credential (so identity tweaks like point updates don't wipe
 *  the quick-enter ability). */
export function saveIdentity(identity: CastleIdentity): void {
  const existing = readStored()
  writeStored({
    savedAt: Date.now(),
    identity,
    ...(existing?.credential ? { credential: existing.credential } : {}),
  })
}

/** Save identity + a fresh credential. Called by the wicket on a
 *  successful castleEnter so future visits can quick-enter. */
export function saveIdentityWithCredential(identity: CastleIdentity, credential: CastleCredential): void {
  writeStored({ savedAt: Date.now(), identity, credential })
}

/** Drop the live identity but keep the cached credential so the wicket
 *  can still render the "Welcome back" quick-enter path on the next
 *  visit. Used by the Hall's Sign out button. */
export function clearIdentityKeepCredential(): void {
  const existing = readStored()
  if (!existing || !existing.credential) {
    clearIdentity()
    return
  }
  writeStored({ savedAt: existing.savedAt, credential: existing.credential })
}

/** Full forget — clears both identity and credential. Used by the
 *  wicket's "Not <name>?" link when the user explicitly disowns the
 *  cached account. */
export function clearIdentity(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(IDENTITY_KEY)
  } catch {
    // Ignore.
  }
}

/** Generate a throwaway display name for the bypass path. Format: Guest-1234. */
export function generateBypassName(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `Guest-${n}`
}
