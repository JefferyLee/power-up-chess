// hostAmbientStory — scheduled (every 3 min) ambient storytelling.
//
// Thin wrapper around pickAndPostStory: checks live presence + hourly
// cap, then delegates. The on-demand hostTellStory callable shares
// the same helper but bypasses the hourly cap (callers explicitly ask).

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { GEMINI_API_KEY } from './hostChatReply'
import { pickAndPostStory, type AmbientState } from './pickAndPostStory'
import type { PresenceDoc } from './chatTypes'

const PRESENCE_TTL_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
// 4 stories per 24h total — enough to feel alive, sparse enough that
// the Hall isn't a fire hose. Also enforce a minimum gap so the day's
// quota doesn't burst in a 10-minute window.
const MAX_PER_DAY = 4
const MIN_GAP_MS = 90 * 60 * 1000  // 90 minutes between stories

export const hostAmbientStory = onSchedule(
  { schedule: 'every 3 minutes', timeoutSeconds: 60, secrets: [GEMINI_API_KEY] },
  async () => {
    const db = getFirestore()
    const now = Date.now()

    // Any guests in the Hall RIGHT NOW? Stories post to the Hall chat,
    // so a kid in a puzzle/forest/wizard room doesn't count — the
    // story would land in a room they aren't watching.
    const presSnap = await db
      .collection('lobby/presence/items')
      .where('lastSeenAt', '>=', now - PRESENCE_TTL_MS)
      .get()
    const inHall = presSnap.docs.filter((d) => {
      const loc = (d.data() as PresenceDoc).location
      return !loc || loc.kind === 'hall'
    })
    if (inHall.length === 0) {
      console.log('hostAmbientStory: no one in the Hall, skipping')
      return
    }

    // Daily cap + minimum-gap throttle (ambient only — the on-demand
    // hostTellStory callable has its own per-uid cap).
    const stateRef = db.doc('castle_ambient_state/main')
    const stateSnap = await stateRef.get()
    const state = (stateSnap.data() as AmbientState | undefined) ?? { recentIds: [], postedAt: [] }
    const recentPostedAt = state.postedAt.filter((t) => now - t < DAY_MS)
    if (recentPostedAt.length >= MAX_PER_DAY) {
      console.log(`hostAmbientStory: daily cap (${MAX_PER_DAY}) reached`)
      return
    }
    const lastPosted = recentPostedAt.length > 0 ? Math.max(...recentPostedAt) : 0
    if (lastPosted > 0 && now - lastPosted < MIN_GAP_MS) {
      const waitMin = Math.ceil((MIN_GAP_MS - (now - lastPosted)) / 60_000)
      console.log(`hostAmbientStory: gap not met, ${waitMin}min remaining`)
      return
    }

    const result = await pickAndPostStory({ now })
    if (result) {
      console.log(`hostAmbientStory: posted ${result.storyId} as ${result.hostId}`)
    }
  },
)
