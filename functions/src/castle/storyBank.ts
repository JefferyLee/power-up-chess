// Story bank loader for the host's ambient lines.
//
// Stories live in `data/stories/` (committed) and are bundled into
// `lib/stories.bundle.json` at build time by `scripts/bundle-stories.mjs`.
// The function reads the bundle once on cold start and keeps it in memory;
// at ~120 KB total it's cheap.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { HostId } from '../shared/hostId'

export interface BundledStory {
  id: string
  title: string
  variants: { lucy: string; luca: string }
  motif: string
  era?: string
  source: { book?: string; author?: string }
}

interface Bundle {
  count: number
  stories: BundledStory[]
}

let cached: Bundle | null = null

export function loadBundle(): Bundle {
  if (cached) return cached
  // __dirname at runtime is functions/lib/castle → ../stories.bundle.json
  const bundlePath = resolve(__dirname, '../stories.bundle.json')
  try {
    const raw = readFileSync(bundlePath, 'utf8')
    cached = JSON.parse(raw) as Bundle
  } catch (err) {
    console.error(`storyBank: failed to load ${bundlePath}:`, err)
    cached = { count: 0, stories: [] }
  }
  return cached
}

export function pickStory(recentlyPlayed: Set<string>): BundledStory | null {
  const bundle = loadBundle()
  if (bundle.stories.length === 0) return null
  // Prefer stories not in the recent set. If all are recent, allow any.
  const candidates = bundle.stories.filter((s) => !recentlyPlayed.has(s.id))
  const pool = candidates.length > 0 ? candidates : bundle.stories
  const choice = pool[Math.floor(Math.random() * pool.length)]
  return choice ?? null
}

export function textForHost(story: BundledStory, hostId: HostId): string {
  return hostId === 'lucy' ? story.variants.lucy : story.variants.luca
}
