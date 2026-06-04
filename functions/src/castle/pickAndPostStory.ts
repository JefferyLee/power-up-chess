// Shared "post one ambient story" helper used by BOTH the scheduled
// hostAmbientStory trigger and the on-demand hostTellStory callable.
//
// Picks a story not in the recent set, generates (or cache-hits) its
// quiz, posts the message to lobby/messages, stashes the answer key
// in story_quiz_keys/{messageId}, closes any previous open quiz, and
// updates the ambient state doc.
//
// Callers are responsible for their own rate limits / hourly caps —
// this function just posts.

import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import type { HostId } from '../shared/hostId'
import { hostOnDuty } from '../shared/hostOnDuty'
import { loadBundle, pickStory, textForHost } from './storyBank'
import { getOrGenerateQuiz } from './storyQuiz'
import type { ChatMessageDoc, QuizState } from './chatTypes'

export const RECENT_MEMORY = 40
export const HOUR_MS = 60 * 60 * 1000

export interface AmbientState {
  recentIds: string[]
  /** Story-post timestamps within the last hour; older entries get pruned. */
  postedAt: number[]
  lastQuizMessageId?: string
}

export interface PostStoryResult {
  messageId: string
  storyId: string
  hostId: HostId
}

interface Args {
  /** Force a specific host. Defaults to whichever host is on duty now. */
  hostId?: HostId
  now: number
}

export async function pickAndPostStory(args: Args): Promise<PostStoryResult | null> {
  const db = getFirestore()
  const now = args.now
  const hostId = args.hostId ?? hostOnDuty(now)

  const stateRef = db.doc('castle_ambient_state/main')
  const stateSnap = await stateRef.get()
  const state = (stateSnap.data() as AmbientState | undefined) ?? { recentIds: [], postedAt: [] }

  const bundle = loadBundle()
  if (bundle.count === 0) {
    console.warn('pickAndPostStory: bundle is empty')
    return null
  }
  const story = pickStory(new Set(state.recentIds))
  if (!story) return null

  // Close the previous quiz before posting the new one.
  if (state.lastQuizMessageId) {
    await closeQuiz(db, state.lastQuizMessageId, now)
  }

  // Best-effort quiz generation.
  const quizKey = await getOrGenerateQuiz(story)
  const quizState: QuizState | undefined = quizKey
    ? { question: quizKey.question, state: 'open' }
    : undefined

  // Story body goes to its own surface in the Hall ("under the host's
  // portrait"). Chat only carries a short teaser so the story doesn't
  // get buried by ongoing conversation. The quiz STAYS in chat as an
  // interactive card — that's chat-shaped UX (input + submit + winner
  // shoutout).
  const body = textForHost(story, hostId)
  const hostName = hostId === 'lucy' ? 'Lucy' : 'Luca'
  const teaser = `🌿 ${hostName} is telling a new tale — "${story.title}". See it under ${hostName === 'Lucy' ? 'her' : 'his'} portrait.`
  const msg: ChatMessageDoc = {
    name: hostName,
    uid: '',
    normalizedName: '',
    isBypass: false,
    kind: 'host',
    hostId,
    text: teaser,
    ts: now,
    ...(quizState ? { quiz: quizState } : {}),
  }
  const msgRef = await db.collection('lobby/messages/items').add(msg)

  // Publish the full story body to the Hall's current-story panel.
  // Listeners (CurrentStoryPanel) subscribe to this doc and render
  // the body + a TTS button. Replacing the doc on every new story
  // means an offline kid never sees a stale tale.
  await db.doc('castle_live/current_story').set({
    hostId,
    storyId: story.id,
    title: story.title,
    body,
    postedAt: now,
    messageId: msgRef.id,
  })

  if (quizKey) {
    await db.doc(`story_quiz_keys/${msgRef.id}`).set({
      storyId: quizKey.storyId,
      acceptedAnswers: quizKey.acceptedAnswers,
      explanation: quizKey.explanation,
      question: quizKey.question,
      createdAt: now,
    })
  }

  const recentPostedAt = state.postedAt.filter((t) => now - t < HOUR_MS)
  const nextRecent = [story.id, ...state.recentIds.filter((id) => id !== story.id)].slice(0, RECENT_MEMORY)
  // Plain set() (no merge) replaces the whole doc, so omitting
  // lastQuizMessageId when there's no quiz naturally removes the old one.
  await stateRef.set({
    recentIds: nextRecent,
    postedAt: [...recentPostedAt, now],
    lastStoryId: story.id,
    lastStoryAt: FieldValue.serverTimestamp(),
    ...(quizKey ? { lastQuizMessageId: msgRef.id } : {}),
  })

  return { messageId: msgRef.id, storyId: story.id, hostId }
}

/** Mark a still-open quiz as closed and reveal the explanation. No-op
 *  if the quiz was already won or the key was missing. */
async function closeQuiz(db: Firestore, messageId: string, now: number): Promise<void> {
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
