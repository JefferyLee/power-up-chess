// askHost — kid types `/ask Lucy <question>` (or Luca) in the Castle
// Terminal; this callable returns a 1-3 sentence reply in the host's
// voice. The hidden-tier command in the terminal makes the call only
// after the kid has crossed the unlock threshold, but the server is
// the authoritative gate (auth + rate limit + safety scrub).
//
// Limits:
//   • Sign-in required (no bypass) — anonymous kids don't burn LLM budget.
//   • 10 questions / uid / day via the 'ask-day' bucket.
//   • Question must be 4–200 chars; longer is rejected.
//   • Profanity / PII scrub rejects the call rather than asterisk-
//     censoring it (we don't want the LLM seeing pre-scrub text either).
//   • 4-second LLM timeout; fall back to a sorry-line on the client.

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { getFirestore } from 'firebase-admin/firestore'
import { callGemini } from '../commentary/gemini'
import { HOST_PERSONAS } from '../commentary/personas'
import { bumpAndCheck } from './chatRateLimit'
import { scrubMessage } from './profanity'

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

const DAILY_LIMIT = 20
const TIMEOUT_MS = 4000
const QUESTION_MIN = 4
const QUESTION_MAX = 200

const SYSTEM_SUFFIX = `

You are answering a private question from a kid (8–12) typing into a
text-only "castle terminal". Reply in ONE to THREE sentences, in your
own voice, plain text. No markdown, no emoji, no headers.

STAY ON CHESS AND THE CASTLE: rules, pieces, openings, tactics,
endgames, famous players (only ones you are sure of), or castle topics
(puzzles, the forest, the wizard tower). If the question wanders off
(real-world adults, school, personal info, anything unsafe), gently
redirect to chess in one sentence.

NEVER invent chess facts. If you don't know, say so warmly and suggest
a puzzle or game instead.

If the question contains anything inappropriate for a child, reply with
the single token: BLOCKED
`.trim()

export interface AskHostRequest {
  host: 'lucy' | 'luca'
  question: string
}
export type AskHostResponse =
  | { status: 'ok'; answer: string }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'too-long' }
  | { status: 'blocked' }

export const askHost = onCall<AskHostRequest, Promise<AskHostResponse>>(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 10 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const host = req.data?.host === 'luca' ? 'luca' : 'lucy'
    const raw = String(req.data?.question ?? '').trim()
    if (raw.length < QUESTION_MIN) {
      throw new HttpsError('invalid-argument', 'Question too short.')
    }
    if (raw.length > QUESTION_MAX) {
      return { status: 'too-long' as const }
    }

    // Bypass guests don't have a real account — keep them out of the
    // LLM budget. Same guard pattern as castSkill.
    const db = getFirestore()
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData || idData.isBypass || !idData.normalizedName) {
      throw new HttpsError('failed-precondition', 'Sign in with a magic word to ask the hosts.')
    }

    // Safety scrub — if anything tripped, refuse to forward to the LLM.
    const scrub = scrubMessage(raw)
    if (scrub.censored) {
      return { status: 'blocked' as const }
    }

    // Rate limit BEFORE the LLM call so a stuck call doesn't burn the
    // day budget.
    const cap = await bumpAndCheck(uid, 'ask-day', DAILY_LIMIT)
    if (!cap.allowed) {
      return { status: 'rate-limited' as const, retryAfterMs: cap.retryAfterMs }
    }

    const apiKey = process.env.GEMINI_API_KEY ?? GEMINI_API_KEY.value()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Hosts are resting — try again later.')
    }

    const systemPrompt = HOST_PERSONAS[host] + SYSTEM_SUFFIX
    const userPrompt = `${idData.displayName}: ${scrub.text}\n\nYour reply (1–3 sentences, in your voice):`

    let text: string
    try {
      text = await Promise.race([
        callGemini({
          apiKey,
          systemPrompt,
          userPrompt,
          temperature: 0.7,
          maxOutputTokens: 200,
          // Disable internal reasoning — same hazard as hostChatReply:
          // a 1-3 sentence reply doesn't need the model to "think",
          // and reasoning would eat the 200-token budget before any
          // visible text is emitted.
          thinkingBudget: 0,
        }),
        timeoutAfter(TIMEOUT_MS),
      ])
    } catch (err) {
      console.warn('askHost LLM call failed:', err)
      throw new HttpsError('deadline-exceeded', 'No reply came back in time. Try again.')
    }

    const cleaned = text.replace(/^["']|["']$/g, '').trim()
    if (!cleaned || cleaned.length < 2) {
      throw new HttpsError('internal', 'Empty reply.')
    }
    if (/^BLOCKED\b/i.test(cleaned)) {
      return { status: 'blocked' as const }
    }
    // Belt + braces — scrub the LLM's response too.
    const outScrub = scrubMessage(cleaned)
    return { status: 'ok' as const, answer: outScrub.text }
  },
)

function timeoutAfter(ms: number): Promise<string> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('askHost LLM timeout')), ms),
  )
}
