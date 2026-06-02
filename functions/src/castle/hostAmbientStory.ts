// hostAmbientStory — scheduled (every 3 min) ambient storytelling.
//
// Thin wrapper around pickAndPostStory: checks live presence + hourly
// cap, then delegates. The on-demand hostTellStory callable shares
// the same helper but bypasses the hourly cap (callers explicitly ask).

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { GEMINI_API_KEY } from './hostChatReply'
import { HOUR_MS, pickAndPostStory, type AmbientState } from './pickAndPostStory'
import type { PresenceDoc } from './chatTypes'

const PRESENCE_TTL_MS = 60 * 1000
// Temporarily bumped from 6 → 30 while debugging quiz generation; the
// existing 6/hr burned through with broken quizzes and there's no
// per-story-failed retry. Will lower back to 6 once fix is verified.
const MAX_PER_HOUR = 30

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

    // Hourly cap (ambient only — on-demand has its own per-uid cap).
    const stateRef = db.doc('castle_ambient_state/main')
    const stateSnap = await stateRef.get()
    const state = (stateSnap.data() as AmbientState | undefined) ?? { recentIds: [], postedAt: [] }
    const recentPostedAt = state.postedAt.filter((t) => now - t < HOUR_MS)
    if (recentPostedAt.length >= MAX_PER_HOUR) {
      console.log(`hostAmbientStory: hourly cap (${MAX_PER_HOUR}) reached`)
      return
    }

    const result = await pickAndPostStory({ now })
    if (result) {
      console.log(`hostAmbientStory: posted ${result.storyId} as ${result.hostId}`)
    }
  },
)
