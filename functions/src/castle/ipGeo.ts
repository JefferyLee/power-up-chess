// IP capture utility for castleEnter + the castle_point_audit ledger.
//
// Raw IPs are never persisted — we HMAC-SHA256 them with a project
// secret so "is this the same source as last time?" comparisons still
// work without retaining PII.
//
// The ip-api.com country/city lookup that used to live here was removed
// on 2026-09-29: its free tier is plain HTTP (a child's IP in the clear
// to a third party) and non-commercial only. Old guest docs may still
// carry first*/recent* country + city; nothing writes them any more.

import { createHmac } from 'node:crypto'

/** Default salt — overridable via env. The hash is only ever shown to
 *  Jeff (admin tier), so this isn't load-bearing security; it just
 *  rules out trivial rainbow-table lookups on the stored hex. */
const IP_HASH_SECRET = process.env.IP_HASH_SECRET ?? 'puc-ip-hash-v1'

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
