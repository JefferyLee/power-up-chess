// Every localStorage / sessionStorage key this app writes, in one place.
//
// Keys are NOT renamed here — the data already sitting in children's
// browsers must survive — so the historical separators (`puc:`,
// `puc:terminal-`, `puc.`, `puc-`) stay exactly as they were written.
// New keys should follow `puc:<area>:<name>:vN`.
//
// `listOurKeys()` is what the forget-me wipe walks, so a key that is
// not registered here is a key that survives "delete my account".

export interface StorageKeyEntry {
  readonly key: string
  /** Schema version baked into the key (only some keys carry one). */
  readonly version?: number
  readonly scope: 'local' | 'session'
  readonly description: string
}

const local = (key: string, description: string, version?: number): StorageKeyEntry =>
  version === undefined ? { key, scope: 'local', description } : { key, version, scope: 'local', description }

export const KEYS = {
  // ── App-wide prefs and progress ──────────────────────────────────
  learnDone: local('puc:learn:done:v1', 'Lesson ids the kid has finished (checkmarks in /learn).', 1),
  profile: local('puc:profile:v1', 'Display name, time control, AI level, theme, crowns, avatar.', 1),
  castleIdentity: local('puc:castle-identity:v2', 'Cached castle identity + credential, 5-day sliding TTL.', 2),
  muted: local('puc:muted:v1', 'Global sound mute (1/0).', 1),
  templateOnly: local('puc:template-only', 'Parental switch: hosts use templates only, no LLM (1/0).'),
  hideLeaderboards: local('puc:hide-leaderboards', 'Last known value of the server-side leaderboard opt-out (1/0).'),
  reviewEngineOpen: local('puc:review-engine-open', 'Engine-details fold open in the post-game review (1/0).'),
  firstWinDone: local('puc:first-win-done', 'The grand first-win ceremony has already played (1).'),
  aiAdaptiveIdx: local('puc:ai-adaptive-idx', 'Adaptive AI difficulty ladder index.'),
  aiAdaptiveOn: local('puc:ai-adaptive-on', 'Adaptive AI difficulty enabled (1/0).'),
  chatHiddenAuthors: local('puc:chat-hidden-authors:v1', 'Normalized names muted in Hall chat, JSON array.', 1),
  chatClearedAt: local('puc:chat-cleared-at', 'Timestamp before which Hall chat is hidden for this device.'),
  onboardingSeen: local('puc.onboardingSeen', 'First-visit guide dismissed (1/0).'),
  board3dView: local('puc.board3d.view', '3D board toggle (1/0).'),
  board3dPalette: local('puc.board3d.palette', '3D board look: wood | candy (classic = legacy alias of candy).'),
  siegeProgress: local('puc.siege.progress', 'Siege stars, best scores, endless / daily bests, achievements (JSON).'),

  // ── Castle Terminal (all browser-local) ───────────────────────────
  terminalMuted: local('puc:terminal-muted', 'Terminal key-click mute (1 when muted, absent otherwise).'),
  terminalRoom: local('puc:terminal-room', 'Current terminal room id.'),
  terminalVisited: local('puc:terminal-visited', 'Terminal room ids visited, JSON array.'),
  terminalInventory: local('puc:terminal-inventory', 'Items the kid carries, JSON array.'),
  terminalTaken: local('puc:terminal-taken', 'Items already removed from rooms, JSON array.'),
  terminalCellarOpen: local('puc:terminal-cellar-open', 'The cellar has been unlocked (1).'),
  terminalMysterySolved: local('puc:terminal-mystery-solved', 'Solved mysteries by day (JSON).'),
  terminalPuzzleState: local('puc:terminal-puzzle-state', 'In-progress /puzzle session (JSON).'),
  terminalPlayState: local('puc:terminal-play-state', 'In-progress /play game (JSON).'),
  terminalGuessState: local('puc:terminal-guess-state', '/guess mini-game (JSON).'),
  terminalHangmanState: local('puc:terminal-hangman-state', '/hangman mini-game (JSON).'),
  terminalWordleState: local('puc:terminal-wordle-state', '/wordle mini-game (JSON).'),
  terminal24State: local('puc:terminal-24-state', '/24 mini-game (JSON).'),

  // ── Session-scoped ────────────────────────────────────────────────
  calibrationDismissed: {
    key: 'puc-cal-dismissed',
    scope: 'session',
    description: 'Puzzle Garden calibration banner dismissed for this visit (1).',
  },

  // ── Retired (no longer written; still wiped by forget-me) ─────────
  retiredSessionHost: local('puc:session-host:v1', 'Retired: pre-MVP2 session host cache.', 1),
} as const satisfies Record<string, StorageKeyEntry>

export type StorageKeyName = keyof typeof KEYS

/** Every key this app owns, for the forget-me / sign-out wipe. */
export function listOurKeys(scope?: StorageKeyEntry['scope']): string[] {
  return Object.values(KEYS)
    .filter((e) => scope === undefined || e.scope === scope)
    .map((e) => e.key)
}

// ── Guarded primitives ────────────────────────────────────────────────
// Storage can throw on access (privacy mode, disabled cookies, quota)
// and is absent during SSR / tests without jsdom. Every access here
// is wrapped, so callers never need their own try/catch.

function storeFor(scope: StorageKeyEntry['scope']): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return scope === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function readKey(entry: StorageKeyEntry): string | null {
  try {
    return storeFor(entry.scope)?.getItem(entry.key) ?? null
  } catch {
    return null
  }
}

/** Returns false when the write was refused (quota / privacy mode). */
export function writeKey(entry: StorageKeyEntry, raw: string): boolean {
  try {
    const s = storeFor(entry.scope)
    if (!s) return false
    s.setItem(entry.key, raw)
    return true
  } catch {
    return false
  }
}

export function removeKey(entry: StorageKeyEntry): void {
  try {
    storeFor(entry.scope)?.removeItem(entry.key)
  } catch {
    // Nothing to remove, or storage is off-limits — either way it's gone.
  }
}

/** Read a JSON value; `null` when absent or unparsable. */
export function readJson(entry: StorageKeyEntry): unknown {
  const raw = readKey(entry)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeJson(entry: StorageKeyEntry, value: unknown): boolean {
  return writeKey(entry, JSON.stringify(value))
}
