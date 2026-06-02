// hostAmbientStory — scheduled (every 3 min) ambient storytelling.
//
// Posts ONE story from the bank to lobby/messages, written in the voice of
// whichever host has the most live presence right now. Skips entirely if
// nobody is in the Hall, or if the per-hour cap has been reached.
//
// Each story carries a 1-question comprehension quiz (when the LLM is
// reachable). The first guest to answer correctly earns +1 castle point.
// When a new story posts, the previous quiz is auto-closed and the
// explanation is revealed.
//
// "Recently played" is tracked in a single doc (castle_ambient_state) so
// the scheduler can prefer fresh stories.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { loadBundle, pickStory, textForHost } from './storyBank'
import type { ChatMessageDoc, QuizState } from './chatTypes'
import { hostOnDuty } from '../shared/hostOnDuty'
import { GEMINI_API_KEY } from './hostChatReply'
import { getOrGenerateQuiz } from './storyQuiz'

const PRESENCE_TTL_MS = 60 * 1000
const RECENT_MEMORY = 40    // last N posted stories considered "recent"
const MAX_PER_HOUR = 6
const HOUR_MS = 60 * 60 * 1000

interface AmbientState {
  recentIds: string[]
  /** Story-post timestamps within the last hour; older entries get pruned. */
  postedAt: number[]
  /** Last quiz message id — closed when the next story posts. */
  lastQuizMessageId?: string
}

export const hostAmbientStory = onSchedule(
  { schedule: 'every 3 minutes', timeoutSeconds: 60, secrets: [GEMINI_API_KEY] },
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

    // 4b. Close any previous quiz before posting the new one — this gives
    // late readers the explanation and stops people from sniping old quizzes.
    if (state.lastQuizMessageId) {
      await closeQuiz(db, state.lastQuizMessageId, now)
    }

    // 5. Generate quiz (best-effort — story still posts if the LLM is down).
    const quizKey = await getOrGenerateQuiz(story)
    const quizState: QuizState | undefined = quizKey
      ? { question: quizKey.question, state: 'open' }
      : undefined

    // 6. Post the story.
    const msg: ChatMessageDoc = {
      name: hostId === 'lucy' ? 'Lucy' : 'Luca',
      uid: '',
      normalizedName: '',
      isBypass: false,
      kind: 'host',
      hostId,
      text: textForHost(story, hostId),
      ts: now,
      ...(quizState ? { quiz: quizState } : {}),
    }
    const msgRef = await db.collection('lobby/messages/items').add(msg)

    // 7. Stash the answer key in a function-only collection keyed by the
    // chat message id. The client never sees this doc.
    if (quizKey) {
      await db.doc(`story_quiz_keys/${msgRef.id}`).set({
        storyId: quizKey.storyId,
        acceptedAnswers: quizKey.acceptedAnswers,
        explanation: quizKey.explanation,
        question: quizKey.question,
        createdAt: now,
      })
    }

    // 8. Update state.
    const nextRecent = [story.id, ...state.recentIds.filter((id) => id !== story.id)].slice(0, RECENT_MEMORY)
    await stateRef.set({
      recentIds: nextRecent,
      postedAt: [...recentPostedAt, now],
      lastStoryId: story.id,
      lastStoryAt: FieldValue.serverTimestamp(),
      ...(quizKey ? { lastQuizMessageId: msgRef.id } : { lastQuizMessageId: FieldValue.delete() }),
    })
    console.log(`hostAmbientStory: posted ${story.id} as ${hostId}${quizKey ? ' with quiz' : ''}`)
  },
)

/** Mark a still-open quiz as closed and reveal the explanation. No-op
 *  if the quiz was already won or the key was missing. */
async function closeQuiz(db: FirebaseFirestore.Firestore, messageId: string, now: number): Promise<void> {
  const msgRef = db.doc(`lobby/messages/items/${messageId}`)
  const keyRef = db.doc(`story_quiz_keys/${messageId}`)
  const [msgSnap, keySnap] = await Promise.all([msgRef.get(), keyRef.get()])
  if (!msgSnap.exists) return
  const msg = msgSnap.data() as ChatMessageDoc
  if (!msg.quiz || msg.quiz.state !== 'open') return
  const explanation = keySnap.exists
    ? (keySnap.data() as { explanation?: string }).explanation
    : undefined
  await msgRef.update({
    'quiz.state': 'closed',
    'quiz.resolvedAt': now,
    ...(explanation ? { 'quiz.explanation': explanation } : {}),
  })
}
