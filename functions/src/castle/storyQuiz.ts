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

// Bumped from 4 s → 20 s. Production logs showed Gemini regularly takes
// ~5-10 s for the quiz-shaped JSON output; the old 4 s race was killing
// half-generated responses (which then showed up as "unparseable").
const TIMEOUT_MS = 20_000
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
    console.log(`storyQuiz: cache HIT for ${story.id}`)
    return cacheSnap.data() as StoryQuizKey
  }
  console.log(`storyQuiz: cache MISS for ${story.id} — calling Gemini`)

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
      callGemini({
        apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        temperature: 0.6,
        // gemini-3.5-flash is a thinking model: it burns ~hundreds of
        // tokens on hidden reasoning before producing visible output,
        // and those reasoning tokens count against maxOutputTokens.
        // We saw MAX_TOKENS firing at 13-15 visible tokens with a 400
        // budget — i.e. ~385 tokens of invisible reasoning ate the rest.
        // 4000 gives reasoning ample room AND leaves several hundred
        // for the actual JSON.
        maxOutputTokens: 4000,
      }),
      timeoutAfter(TIMEOUT_MS),
    ])
  } catch (err) {
    console.warn(`storyQuiz: LLM call failed for ${story.id}:`, err)
    return null
  }

  const parsed = tryParseQuizJson(raw)
  if (!parsed) {
    // Log the FULL response (not slice(0,200)) plus its length so we can
    // tell truncation from genuine malformed output.
    console.warn(
      `storyQuiz: unparseable LLM response for ${story.id} (len=${raw.length}): ${raw}`,
    )
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
  console.log(`storyQuiz: cached new quiz for ${story.id} — q="${quiz.question.slice(0, 60)}..."`)
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
  // Try a sequence of progressively more lenient parses. responseMimeType
  // 'application/json' should give us clean JSON, but if the model strays
  // into ```json fences or wraps it in prose, salvage the inner object.
  const candidates = [
    raw.trim(),
    raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim(),
    extractJsonObject(raw),
  ].filter((s): s is string => !!s && s.length > 0)

  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate) as unknown
      if (!obj || typeof obj !== 'object') continue
      const o = obj as { question?: unknown; acceptedAnswers?: unknown; explanation?: unknown }
      if (typeof o.question !== 'string' || o.question.length < 4) continue
      if (typeof o.explanation !== 'string' || o.explanation.length < 4) continue
      if (!Array.isArray(o.acceptedAnswers) || o.acceptedAnswers.length === 0) continue
      const answers = o.acceptedAnswers
        .filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length < 60)
      if (answers.length === 0) continue
      return { question: o.question, acceptedAnswers: answers, explanation: o.explanation }
    } catch {
      // try next candidate
    }
  }
  return null
}

/** Find the first balanced { ... } substring. Useful when the model
 *  prefixes its JSON with prose like "Sure, here you go: { ... }". */
function extractJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function timeoutAfter(ms: number): Promise<string> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('storyQuiz timeout')), ms))
}
