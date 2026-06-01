// Lightweight localStorage-backed profile. Used so a player joining a room via
// a shared link doesn't have to retype their name every time.

const KEY = 'puc:profile:v1'

export interface Profile {
  displayName: string
  /** Time-control preset id. See clock/timeControl.ts for the catalogue. */
  timeControlId: string
  /** AI difficulty preset id. See ai/difficulty.ts. */
  aiDifficultyId: string
  /** Theme tokens id. See theme/themes.ts. */
  themeId: string
  /** Crown Spark counter — accumulates across games. +1 per game win,
   *  +N per excellent/best move surfaced in post-game review. */
  crownCount: number
}

const DEFAULT: Profile = {
  displayName: 'Ada',
  timeControlId: 'untimed',
  aiDifficultyId: 'beginner',
  themeId: 'magic-forest',
  crownCount: 0,
}

export function loadProfile(): Profile {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      displayName: typeof parsed.displayName === 'string' && parsed.displayName.length > 0
        ? parsed.displayName.slice(0, 32)
        : DEFAULT.displayName,
      timeControlId: typeof parsed.timeControlId === 'string' ? parsed.timeControlId : DEFAULT.timeControlId,
      aiDifficultyId: typeof parsed.aiDifficultyId === 'string' ? parsed.aiDifficultyId : DEFAULT.aiDifficultyId,
      themeId: typeof parsed.themeId === 'string' ? parsed.themeId : DEFAULT.themeId,
      crownCount: typeof parsed.crownCount === 'number' && parsed.crownCount >= 0 ? parsed.crownCount : DEFAULT.crownCount,
    }
  } catch {
    return DEFAULT
  }
}

export function saveProfile(p: Profile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Ignore quota / privacy errors.
  }
}

/** Atomically add to the crown counter and persist. Safe to call from any
 *  game/review screen — falls back to a no-op on storage failure. */
export function addCrowns(n: number): number {
  if (n <= 0) return loadProfile().crownCount
  const p = loadProfile()
  const next: Profile = { ...p, crownCount: p.crownCount + n }
  saveProfile(next)
  return next.crownCount
}

/** Pick a host at random for a new game. Used by every local navigation
 *  handler since the StartScreen no longer exposes a host picker. */
export function pickRandomHost(): 'lucy' | 'luca' {
  return Math.random() < 0.5 ? 'lucy' : 'luca'
}
