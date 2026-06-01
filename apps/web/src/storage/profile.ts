// Lightweight localStorage-backed profile. Used so a player joining a room via
// a shared link doesn't have to retype their name every time.

const KEY = 'puc:profile:v1'

/** What the user picked at the StartScreen — broader than the concrete
 *  HostId because we let them choose Both or Surprise. The concrete primary
 *  host is resolved at game-start time inside the navigation handlers. */
export type HostChoice = 'lucy' | 'luca' | 'both' | 'surprise'

export interface Profile {
  displayName: string
  hostChoice: HostChoice
  /** Time-control preset id. See clock/timeControl.ts for the catalogue. */
  timeControlId: string
  /** AI difficulty preset id. See ai/difficulty.ts. */
  aiDifficultyId: string
  /** Theme tokens id. See theme/themes.ts. */
  themeId: string
}

const DEFAULT: Profile = {
  displayName: 'Ada',
  hostChoice: 'lucy',
  timeControlId: 'untimed',
  aiDifficultyId: 'beginner',
  themeId: 'magic-forest',
}

const VALID_HOST_CHOICES: ReadonlySet<HostChoice> = new Set<HostChoice>([
  'lucy', 'luca', 'both', 'surprise',
])

export function loadProfile(): Profile {
  if (typeof window === 'undefined') return DEFAULT
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<Profile> & { hostId?: string }
    // Migration: older profiles had `hostId` (lucy|luca) instead of `hostChoice`.
    const legacyHost = parsed.hostId === 'luca' ? 'luca' : parsed.hostId === 'lucy' ? 'lucy' : undefined
    const choice = (typeof parsed.hostChoice === 'string' && VALID_HOST_CHOICES.has(parsed.hostChoice as HostChoice))
      ? parsed.hostChoice as HostChoice
      : legacyHost ?? DEFAULT.hostChoice
    return {
      displayName: typeof parsed.displayName === 'string' && parsed.displayName.length > 0
        ? parsed.displayName.slice(0, 32)
        : DEFAULT.displayName,
      hostChoice: choice,
      timeControlId: typeof parsed.timeControlId === 'string' ? parsed.timeControlId : DEFAULT.timeControlId,
      aiDifficultyId: typeof parsed.aiDifficultyId === 'string' ? parsed.aiDifficultyId : DEFAULT.aiDifficultyId,
      themeId: typeof parsed.themeId === 'string' ? parsed.themeId : DEFAULT.themeId,
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

/** Resolve a host choice to a concrete primary + optional co-host.
 *  - lucy / luca → that host, no co-host.
 *  - both        → primary alternates per game (rotated by a numeric seed),
 *                  the other is the co-host.
 *  - surprise    → random primary, no co-host. */
export function resolveHostChoice(
  choice: HostChoice,
  seed: number = Date.now(),
): { primary: 'lucy' | 'luca'; coHost?: 'lucy' | 'luca' } {
  if (choice === 'lucy') return { primary: 'lucy' }
  if (choice === 'luca') return { primary: 'luca' }
  if (choice === 'both') {
    const primary = (seed % 2 === 0) ? 'lucy' : 'luca'
    const coHost = primary === 'lucy' ? 'luca' : 'lucy'
    return { primary, coHost }
  }
  // surprise
  const primary = (seed % 2 === 0) ? 'lucy' : 'luca'
  return { primary }
}
