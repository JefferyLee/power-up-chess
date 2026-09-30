// friendlyError — one short, warm sentence for the child in place of a
// raw Firebase / JS error. The real error still goes to the console
// (warn) so a parent or developer can see what actually happened.
//
// Voice (docs/HOST_PERSONAS.md): kind, specific, never babyish, never
// blames the child, always says what to do next.

/** Sentences by gRPC / HttpsError code (the part after `functions/`). */
const BY_CODE: Record<string, string> = {
  unauthenticated: "The Castle doesn't know who you are yet. Come in through the gate, then try again.",
  'permission-denied': "That door is closed for this account. If it should be open, sign in again and retry.",
  'failed-precondition': "That can't happen just yet — something needs to be in place first. Have a look and try once more.",
  'resource-exhausted': "That was quick! The Castle needs a short breather. Try again in a minute.",
  unavailable: "The Castle is out of reach right now. Check your connection and try again in a moment.",
  'deadline-exceeded': "That took too long to answer. Give it another go.",
  'not-found': "We couldn't find that. It may have moved on or closed while you were looking.",
  'invalid-argument': "Something in that request looked odd to the Castle. Check what you typed and try again.",
  'already-exists': "That one already exists. Pick a different name and try again.",
  aborted: "That got interrupted halfway through. Try once more.",
  cancelled: "That was cancelled before it finished. Try again when you're ready.",
  network: "Looks like the connection dropped. Check the Wi-Fi and try again.",
  offline: "Looks like you're offline. Check the Wi-Fi and try again.",
}

/** Codes whose server-written message is usually the specific reason
 *  the kid needs ("Not your turn.", "Team is already full."). We keep
 *  that message when it reads like a sentence for a person. */
const KEEP_SERVER_MESSAGE = new Set([
  'failed-precondition',
  'invalid-argument',
  'permission-denied',
  'not-found',
  'already-exists',
  'resource-exhausted',
  'aborted',
])

function generic(context?: string): string {
  return context
    ? `Something went wrong while ${context} — on our side, not yours. Try again in a moment.`
    : 'Something went wrong on our side, not yours. Try again in a moment.'
}

/** A message written for a person, not a developer. */
export function looksHuman(msg: string): boolean {
  const m = msg.trim()
  if (m.length < 8 || m.length > 200) return false
  if (!/[.!?)…]$/.test(m)) return false
  if (!m.includes(' ')) return false
  if (/[a-z][A-Z]/.test(m) || m.includes('_')) return false // camelCase / snake_case identifiers
  if (/^(bad|invalid|unknown|internal|unexpected)\b/i.test(m)) return false
  if (/\b(required|payload|undefined|null|missing|param|token|uid|json)\b/i.test(m)) return false
  return true
}

/** The bare error code, with Firebase's `functions/` / `auth/` /
 *  `firestore/` prefixes removed. `null` when there is none. */
export function errorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const code = (err as { code?: unknown }).code
  if (typeof code !== 'string' || code.length === 0) return null
  const bare = code.includes('/') ? code.slice(code.lastIndexOf('/') + 1) : code
  return bare.toLowerCase()
}

function rawMessage(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/^FirebaseError: /, '')
  if (typeof err === 'string') return err
  return String(err)
}

function isNetworkError(err: unknown, code: string | null): boolean {
  if (code === 'network-request-failed' || code === 'unavailable') return true
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) return true
  return false
}

/**
 * @param err      whatever was thrown
 * @param context  what was being attempted, as a gerund phrase used in the
 *                 generic fallback and the console line: `'loading your games'`
 */
export function friendlyError(err: unknown, context?: string): string {
  console.warn(`[puc] ${context ?? 'error'}:`, err)

  const code = errorCode(err)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return BY_CODE.offline!
  if (isNetworkError(err, code)) return BY_CODE.network!
  if (code === null) return generic(context)

  if (KEEP_SERVER_MESSAGE.has(code)) {
    const msg = rawMessage(err)
    if (looksHuman(msg)) return msg
  }
  return BY_CODE[code] ?? generic(context)
}
