// Generate (and cache) a 1-question comprehension quiz for an ambient
// story. The quiz is the same regardless of host voice — it tests facts
// in the story — so we cache by storyId only and re-use forever.
//
// Returns null if the LLM is unavailable or produced unparseable output;
// the caller can post the story without a quiz in that case.

import { getFirestore } from 'firebase-admin/firestore'
import { callGemini } from '../commentary/gemini'
import { GEMINI_API_KEY } from './hostChatReply'
import type { BundledStory } from './storyBank'

export interface StoryQuizKey {
  storyId: string
  question: string
  /** Lowercased + punctuation-stripped accepted answers. */
  acceptedAnswers: string[]
  explanation: string
  createdAt: number
}

const TIMEOUT_MS = 4000
const SYSTEM_PROMPT = `
You write one short comprehension question for an 8-10 year old based on a
short chess story they just heard. Pick a single concrete fact from the story
(a name, a place, a year, a piece, a word the story used). The answer must
appear directly in the story and be 1-3 words long.

Reply ONLY with a JSON object (no markdown, no backticks, no commentary) of
exactly this shape:

{
  "question": "string ending in ?",
  "acceptedAnswers": ["primary answer", "lowercase variant", "another way to say it"],
  "explanation": "one short sentence stating the answer and where it appears"
}

Rules:
- 2-4 entries in acceptedAnswers. All lowercase, no surrounding punctuation.
- Include common alternate spellings, abbreviations, with/without the word "the".
- Question must be answerable from the story alone.
`.trim()

export async function getOrGenerateQuiz(story: BundledStory): Promise<StoryQuizKey | null> {
  const db = getFirestore()
  const cacheRef = db.doc(`story_quiz_cache/${story.id}`)
  const cacheSnap = await cacheRef.get()
  if (cacheSnap.exists) {
    return cacheSnap.data() as StoryQuizKey
  }

  const apiKey = process.env.GEMINI_API_KEY ?? GEMINI_API_KEY.value()
  if (!apiKey) {
    console.warn('storyQuiz: no GEMINI_API_KEY available')
    return null
  }

  // Use the lucy variant as the canonical story text — the underlying facts
  // are the same in both, and pinning one keeps the cache deterministic.
  const userPrompt = [
    `Story title: ${story.title}`,
    ``,
    `Story:`,
    story.variants.lucy,
    ``,
    `Generate the JSON now:`,
  ].join('\n')

  let raw: string
  try {
    raw = await Promise.race([
      callGemini({ apiKey, systemPrompt: SYSTEM_PROMPT, userPrompt, temperature: 0.6, maxOutputTokens: 250 }),
      timeoutAfter(TIMEOUT_MS),
    ])
  } catch (err) {
    console.warn(`storyQuiz: LLM call failed for ${story.id}:`, err)
    return null
  }

  const parsed = tryParseQuizJson(raw)
  if (!parsed) {
    console.warn(`storyQuiz: unparseable LLM response for ${story.id}:`, raw.slice(0, 200))
    return null
  }

  const quiz: StoryQuizKey = {
    storyId: story.id,
    question: parsed.question,
    acceptedAnswers: parsed.acceptedAnswers.map(normalizeAnswer).filter((s) => s.length > 0),
    explanation: parsed.explanation,
    createdAt: Date.now(),
  }
  if (quiz.acceptedAnswers.length === 0) return null
  await cacheRef.set(quiz)
  return quiz
}

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface ParsedQuiz {
  question: string
  acceptedAnswers: string[]
  explanation: string
}

function tryParseQuizJson(raw: string): ParsedQuiz | null {
  // Models sometimes wrap JSON in ```json fences despite instructions; strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    const obj = JSON.parse(cleaned) as unknown
    if (!obj || typeof obj !== 'object') return null
    const o = obj as { question?: unknown; acceptedAnswers?: unknown; explanation?: unknown }
    if (typeof o.question !== 'string' || o.question.length < 4) return null
    if (typeof o.explanation !== 'string' || o.explanation.length < 4) return null
    if (!Array.isArray(o.acceptedAnswers) || o.acceptedAnswers.length === 0) return null
    const answers = o.acceptedAnswers
      .filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length < 60)
    if (answers.length === 0) return null
    return { question: o.question, acceptedAnswers: answers, explanation: o.explanation }
  } catch {
    return null
  }
}

function timeoutAfter(ms: number): Promise<string> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('storyQuiz timeout')), ms))
}
