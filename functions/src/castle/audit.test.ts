// castle_point_audit row shape — the raw client IP must never reach
// Firestore; only its HMAC does.

import { describe, expect, it } from 'vitest'
import { toAuditRecord } from './audit'
import { hashIp } from './ipGeo'

const base = { normalizedName: 'ada', uid: 'u1', delta: 5, before: 0, after: 5, source: 'puzzle:solve' }

describe('toAuditRecord', () => {
  it('stores only the HMAC of the client IP, never the raw address', () => {
    const row = toAuditRecord({ ...base, ip: '203.0.113.7' }, 1234)
    expect(row).toEqual({ ...base, ipHash: hashIp('203.0.113.7'), serverTs: 1234 })
    expect(row).not.toHaveProperty('ip')
    expect(JSON.stringify(row)).not.toContain('203.0.113.7')
  })
  it('omits ipHash when no IP was captured', () => {
    expect(toAuditRecord(base, 1234)).toEqual({ ...base, serverTs: 1234 })
  })
})
