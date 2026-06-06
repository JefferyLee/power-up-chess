// Origin display helpers — country flag + online status bucket.
//
// Server enforces the field tier (public sees country only; owner sees
// city; admin sees IP hash) — the client just renders whatever came
// back. These helpers stay UI-only.

/** Convert an ISO 3166-1 alpha-2 code to its flag emoji. Returns the
 *  empty string for any input that isn't a 2-letter code so callers
 *  can `flag(code) || fallback` without extra branching. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return ''
  const upper = code.toUpperCase()
  const A = 0x41
  const offset = 0x1F1E6 - A
  const c1 = upper.charCodeAt(0)
  const c2 = upper.charCodeAt(1)
  if (c1 < A || c1 > A + 25 || c2 < A || c2 > A + 25) return ''
  return String.fromCodePoint(c1 + offset, c2 + offset)
}

export interface StatusBadge {
  /** Round indicator — green / amber / hollow. */
  dot: '🟢' | '🟡' | '⚪'
  /** Short label, e.g. "online" / "active today" / "away". */
  label: string
  /** Tooltip / accessible name with a touch more context. */
  title: string
}

export function statusBadge(status: 'online' | 'today' | 'away'): StatusBadge {
  switch (status) {
    case 'online':
      return { dot: '🟢', label: 'online', title: 'Online now' }
    case 'today':
      return { dot: '🟡', label: 'active today', title: 'Active in the last 24 hours' }
    case 'away':
      return { dot: '⚪', label: 'away', title: 'Not seen recently' }
  }
}

/** Format "YYYY-MM" as "Mon YYYY", e.g. "Jun 2026". Returns "—" for null. */
export function formatJoinedMonth(joinedMonth: string | null): string {
  if (!joinedMonth || !/^\d{4}-\d{2}$/.test(joinedMonth)) return '—'
  const [y, m] = joinedMonth.split('-')
  const month = Number(m)
  if (!Number.isFinite(month) || month < 1 || month > 12) return joinedMonth
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[month - 1]} ${y}`
}

/** Render the IP hash as a short fingerprint, e.g. "a1b2c3…7d8e".
 *  Full 64-char hash is hard to scan; the head+tail gives Jeff enough
 *  to compare "same source as last time?" at a glance. */
export function shortenIpHash(hash: string | null): string {
  if (!hash || hash.length < 12) return hash ?? '—'
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}
