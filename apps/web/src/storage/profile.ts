// Lightweight localStorage-backed profile. Used so a player joining a room via
// a shared link doesn't have to retype their name every time.

const KEY = 'puc:profile:v1'

export interface Profile {
  displayName: string
  hostId: 'lucy' | 'luca'
  /** Time-control preset id. See clock/timeControl.ts for the catalogue. */
  timeControlId: string
  /** AI difficulty preset id. See ai/difficulty.ts. */
  aiDifficultyId: string
}

const DEFAULT: Profile = {
  displayName: 'Ada',
  hostId: 'lucy',
  timeControlId: 'untimed',
  aiDifficultyId: 'beginner',
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
      hostId: parsed.hostId === 'luca' ? 'luca' : 'lucy',
      timeControlId: typeof parsed.timeControlId === 'string' ? parsed.timeControlId : DEFAULT.timeControlId,
      aiDifficultyId: typeof parsed.aiDifficultyId === 'string' ? parsed.aiDifficultyId : DEFAULT.aiDifficultyId,
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
