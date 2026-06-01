// hostAmbientStory — scheduled (every 3 min) ambient storytelling.
//
// Posts ONE story from the bank to lobby/messages, written in the voice of
// whichever host has the most live presence right now. Skips entirely if
// nobody is in the Hall, or if the per-hour cap has been reached.
//
// "Recently played" is tracked in a single doc (castle_ambient_state) so
// the scheduler can prefer fresh stories.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { loadBundle, pickStory, textForHost } from './storyBank'
import type { ChatMessageDoc } from './chatTypes'
import { hostOnDuty } from '../shared/hostOnDuty'

const PRESENCE_TTL_MS = 60 * 1000
const RECENT_MEMORY = 40    // last N posted stories considered "recent"
const MAX_PER_HOUR = 6
const HOUR_MS = 60 * 60 * 1000

interface AmbientState {
  recentIds: string[]
  /** Story-post timestamps within the last hour; older entries get pruned. */
  postedAt: number[]
}

export const hostAmbientStory = onSchedule(
  { schedule: 'every 3 minutes', timeoutSeconds: 60 },
  async () => {
    const db = getFirestore()
    const now = Date.now()

    // 1. Any guests in the Hall right now?
    const presSnap = await db
      .collection('lobby/presence/items')
      .where('lastSeenAt', '>=', now - PRESENCE_TTL_MS)
      .get()
    if (presSnap.empty) {
      console.log('hostAmbientStory: no live presence, skipping')
      return
    }

    // 2. Decide which host narrates — wall-clock rotation, same for everyone.
    const hostId = hostOnDuty(now)

    // 3. Load state + check hourly cap.
    const stateRef = db.doc('castle_ambient_state/main')
    const stateSnap = await stateRef.get()
    const state = (stateSnap.data() as AmbientState | undefined) ?? { recentIds: [], postedAt: [] }
    const recentPostedAt = state.postedAt.filter((t) => now - t < HOUR_MS)
    if (recentPostedAt.length >= MAX_PER_HOUR) {
      console.log(`hostAmbientStory: hourly cap (${MAX_PER_HOUR}) reached`)
      return
    }

    // 4. Pick a story.
    const bundle = loadBundle()
    if (bundle.count === 0) {
      console.warn('hostAmbientStory: bundle is empty')
      return
    }
    const story = pickStory(new Set(state.recentIds))
    if (!story) return

    // 5. Post.
    const msg: ChatMessageDoc = {
      name: hostId === 'lucy' ? 'Lucy' : 'Luca',
      uid: '',
      normalizedName: '',
      isBypass: false,
      kind: 'host',
      hostId,
      text: textForHost(story, hostId),
      ts: now,
    }
    await db.collection('lobby/messages/items').add(msg)

    // 6. Update state.
    const nextRecent = [story.id, ...state.recentIds.filter((id) => id !== story.id)].slice(0, RECENT_MEMORY)
    await stateRef.set({
      recentIds: nextRecent,
      postedAt: [...recentPostedAt, now],
      lastStoryId: story.id,
      lastStoryAt: FieldValue.serverTimestamp(),
    })
    console.log(`hostAmbientStory: posted ${story.id} as ${hostId}`)
  },
)
