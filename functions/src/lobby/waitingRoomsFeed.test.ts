import { describe, expect, it } from 'vitest'
import { buildFeedRows, FEED_MAX_PER_KIND } from './waitingRoomsFeed'

const room = (id: string, createdAt: number, extra: Record<string, unknown> = {}) => ({
  id,
  white: { uid: `uid-${id}`, displayName: `Host ${id}`, normalizedName: `host ${id}`, isBypass: false },
  black: null,
  status: 'waiting',
  createdAt,
  ...extra,
})

describe('buildFeedRows', () => {
  it('publishes display names only — never uid or normalizedName', () => {
    const rows = buildFeedRows([room('a', 1, { timeControl: { initialMs: 300_000, incrementMs: 0 } })], 'chess')
    expect(rows).toEqual([{
      roomId: 'a',
      hostDisplayName: 'Host a',
      hostIsBypass: false,
      createdAt: 1,
      timeControl: { initialMs: 300_000, incrementMs: 0 },
    }])
    const json = JSON.stringify(rows)
    expect(json).not.toContain('uid')
    expect(json).not.toContain('normalizedName')
  })

  it('marks bypass hosts (no normalizedName) and omits timeControl for wizard rooms', () => {
    const rows = buildFeedRows([{ id: 'w', white: { displayName: 'Ghost' }, createdAt: 5 }], 'wizard')
    expect(rows).toEqual([{ roomId: 'w', hostDisplayName: 'Ghost', hostIsBypass: true, createdAt: 5 }])
    expect('timeControl' in rows[0]!).toBe(false)
  })

  it('sorts newest first and caps at FEED_MAX_PER_KIND', () => {
    const many = Array.from({ length: FEED_MAX_PER_KIND + 5 }, (_, i) => room(`r${i}`, i))
    const rows = buildFeedRows(many, 'chess')
    expect(rows).toHaveLength(FEED_MAX_PER_KIND)
    expect(rows[0]!.roomId).toBe(`r${FEED_MAX_PER_KIND + 4}`)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.createdAt).toBeGreaterThanOrEqual(rows[i]!.createdAt)
    }
  })
})
