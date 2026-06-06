// IP capture + geolocation utility for castleEnter origin tracking.
//
// Raw IPs are never persisted — we HMAC-SHA256 them with a project
// secret so "is this the same source as last time?" comparisons still
// work without retaining PII. Country / city come from ip-api.com's
// free tier (HTTP, no key, 45 req/min) — fine server-side.

import { createHmac } from 'node:crypto'

/** Default salt — overridable via env. The hash is only ever shown to
 *  Jeff (admin tier), so this isn't load-bearing security; it just
 *  rules out trivial rainbow-table lookups on the stored hex. */
const IP_HASH_SECRET = process.env.IP_HASH_SECRET ?? 'puc-ip-hash-v1'

const GEO_TIMEOUT_MS = 2500

export interface CallableLikeRequest {
  rawRequest: {
    ip?: string
    headers: Record<string, string | string[] | undefined>
  }
}

/** Pull the originating client IP. Trusts X-Forwarded-For (Cloud
 *  Functions sits behind GCLB which sets it) and falls back to the
 *  express-parsed ip. */
export function extractIp(req: CallableLikeRequest): string | null {
  const xff = req.rawRequest.headers['x-forwarded-for']
  const xffStr = Array.isArray(xff) ? xff[0] : xff
  if (typeof xffStr === 'string') {
    const first = xffStr.split(',')[0]?.trim()
    if (first) return first
  }
  return req.rawRequest.ip ?? null
}

export function hashIp(ip: string): string {
  return createHmac('sha256', IP_HASH_SECRET).update(ip).digest('hex')
}

export interface GeoResult {
  /** ISO 3166-1 alpha-2, e.g. 'US'. */
  country?: string
  city?: string
}

/** Resolve an IP to country + city via ip-api.com. Returns null for
 *  private/loopback IPs and on any error or timeout — callers should
 *  treat null as "skip the geo write" and keep going. */
export async function lookupGeo(ip: string): Promise<GeoResult | null> {
  if (!ip || isPrivateIp(ip)) return null
  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,city`
    const res = await fetch(url, { signal: AbortSignal.timeout(GEO_TIMEOUT_MS) })
    if (!res.ok) return null
    const data = (await res.json()) as { status?: string; countryCode?: string; city?: string }
    if (data.status !== 'success') return null
    const out: GeoResult = {}
    if (typeof data.countryCode === 'string' && data.countryCode.length === 2) {
      out.country = data.countryCode.toUpperCase()
    }
    if (typeof data.city === 'string' && data.city.length > 0) {
      out.city = data.city.slice(0, 64)
    }
    return out.country || out.city ? out : null
  } catch {
    return null
  }
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fe80:') ||
    /^f[cd][0-9a-f]{2}:/i.test(ip)
  )
}
