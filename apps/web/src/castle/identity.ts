// Castle identity — the name+magic-word layer on top of Anonymous Auth.
//
// Persisted in sessionStorage so a refresh keeps the guest signed in, but
// opening a new tab re-rolls the host and re-asks for name. Three concerns
// live here:
//   1. The session host (Lucy or Luca), rolled once and sticky.
//   2. The castle identity (displayName, normalizedName, castlePoints,
//      isBypass) — written after a successful castleEnter or castleBypass.
//   3. The client-side magic-word hash, so the network never sees plaintext.

import type { HostId } from '../hosts/hosts'

const HOST_KEY = 'puc:session-host:v1'
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

/** Pick (or read) the session host. First call this session rolls Lucy/Luca
 *  uniformly; subsequent calls return the same value until sessionStorage is
 *  cleared (new tab, browser restart). */
export function sessionHost(): HostId {
  if (typeof window === 'undefined') return 'lucy'
  try {
    const stored = window.sessionStorage.getItem(HOST_KEY)
    if (stored === 'lucy' || stored === 'luca') return stored
    const rolled: HostId = Math.random() < 0.5 ? 'lucy' : 'luca'
    window.sessionStorage.setItem(HOST_KEY, rolled)
    return rolled
  } catch {
    return 'lucy'
  }
}

/** Force a re-roll of the session host. Used by "switch host" UI later. */
export function rerollSessionHost(): HostId {
  if (typeof window === 'undefined') return 'lucy'
  try {
    const current = window.sessionStorage.getItem(HOST_KEY)
    const next: HostId = current === 'lucy' ? 'luca' : 'lucy'
    window.sessionStorage.setItem(HOST_KEY, next)
    return next
  } catch {
    return 'lucy'
  }
}

export function loadIdentity(): CastleIdentity | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CastleIdentity>
    if (typeof parsed.displayName !== 'string' || parsed.displayName.length === 0) return null
    if (typeof parsed.normalizedName !== 'string' || parsed.normalizedName.length === 0) return null
    return {
      displayName: parsed.displayName,
      normalizedName: parsed.normalizedName,
      castlePoints: typeof parsed.castlePoints === 'number' && parsed.castlePoints >= 0 ? parsed.castlePoints : 0,
      isBypass: parsed.isBypass === true,
      isFirstVisit: parsed.isFirstVisit === true,
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
