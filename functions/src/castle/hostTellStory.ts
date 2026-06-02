// hostTellStory — on-demand companion to hostAmbientStory.
//
// Triggered from the host-avatar button in the Hall. Per-uid rate-
// limited (1/min + 5/day) so a kid hammering the button doesn't flood
// chat or burn Gemini calls. Bypasses the ambient hourly cap because
// the request is intentional. Re-uses the same pickAndPostStory helper
// (including the answer-key write + close-previous-quiz behaviour).

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { GEMINI_API_KEY } from './hostChatReply'
import { bumpAndCheck } from './chatRateLimit'
import { pickAndPostStory } from './pickAndPostStory'
import type { HostId } from '../shared/hostId'

const PER_MIN_CAP = 1
// Temporarily bumped from 5 → 50 while the quiz-generation pipeline is
// being debugged. Will lower back to 5 once we confirm fresh stories
// reliably carry quizzes.
const PER_DAY_CAP = 50

interface Request {
  /** Optional host hint — usually the host currently on duty. */
  hostId?: HostId
}
type Response =
  | { status: 'ok'; messageId: string; storyId: string; hostId: HostId }
  | { status: 'rate-limited'; retryAfterMs: number; scope: 'minute' | 'day' }
  | { status: 'no-story-available' }

export const hostTellStory = onCall<Request, Promise<Response>>(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid

    const minCheck = await bumpAndCheck(uid, 'story-min', PER_MIN_CAP)
    if (!minCheck.allowed) {
      console.log(`hostTellStory: uid=${uid} rate-limited minute (retry ${minCheck.retryAfterMs}ms)`)
      return { status: 'rate-limited', retryAfterMs: minCheck.retryAfterMs, scope: 'minute' }
    }
    const dayCheck = await bumpAndCheck(uid, 'story-day', PER_DAY_CAP)
    if (!dayCheck.allowed) {
      console.log(`hostTellStory: uid=${uid} rate-limited day (retry ${dayCheck.retryAfterMs}ms)`)
      return { status: 'rate-limited', retryAfterMs: dayCheck.retryAfterMs, scope: 'day' }
    }

    const hostId: HostId | undefined =
      req.data?.hostId === 'lucy' || req.data?.hostId === 'luca' ? req.data.hostId : undefined

    const result = await pickAndPostStory({ now: Date.now(), hostId })
    if (!result) {
      console.log(`hostTellStory: uid=${uid} no-story-available`)
      return { status: 'no-story-available' }
    }
    console.log(`hostTellStory: uid=${uid} posted ${result.storyId} as ${result.hostId} (messageId=${result.messageId})`)
    return { status: 'ok', messageId: result.messageId, storyId: result.storyId, hostId: result.hostId }
  },
)
