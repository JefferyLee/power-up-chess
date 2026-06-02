// hostAmbientStory — scheduled (every 3 min) ambient storytelling.
//
// Thin wrapper around pickAndPostStory: checks live presence + hourly
// cap, then delegates. The on-demand hostTellStory callable shares
// the same helper but bypasses the hourly cap (callers explicitly ask).

import { getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { GEMINI_API_KEY } from './hostChatReply'
import { HOUR_MS, pickAndPostStory, type AmbientState } from './pickAndPostStory'

const PRESENCE_TTL_MS = 60 * 1000
const MAX_PER_HOUR = 6

export const hostAmbientStory = onSchedule(
  { schedule: 'every 3 minutes', timeoutSeconds: 60, secrets: [GEMINI_API_KEY] },
  async () => {
    const db = getFirestore()
    const now = Date.now()

    // Any guests in the Hall right now?
    const presSnap = await db
      .collection('lobby/presence/items')
      .where('lastSeenAt', '>=', now - PRESENCE_TTL_MS)
      .get()
    if (presSnap.empty) {
      console.log('hostAmbientStory: no live presence, skipping')
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
