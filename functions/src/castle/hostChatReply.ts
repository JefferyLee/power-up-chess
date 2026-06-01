// hostChatReply — internal helper, called from postChat when the user
// mentions @Lucy / @Luca / @host. Generates a 1-3 sentence reply via
// Gemini using the same persona system as in-game commentary.
//
// Rate-limited per uid (15 LLM replies / day per the spec).
// Hard timeout of 3 s; falls back to a template at the call site.

import { defineSecret } from 'firebase-functions/params'
import { callGemini } from '../commentary/gemini'
import { HOST_PERSONAS } from '../commentary/personas'
import { bumpAndCheck } from './chatRateLimit'
import { CHAT_LIMITS } from './chatTypes'
import type { HostId } from '../shared/hostId'

export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

const MENTION_RE = /@(host|lucy|luca)/i
const TIMEOUT_MS = 3000

const SYSTEM_SUFFIX = `

You are chatting in a shared Hall lobby. A user has tagged you. Reply in
ONE or TWO sentences, in your own voice. Stay on chess: the game's rules,
history, players, openings, tactics, or "do you want to play?". Refuse
politely if asked anything off-topic.

NEVER invent chess facts. If unsure, say so and suggest a game or puzzle
instead. Be warm. No emoji. No headers. Plain text only.
`.trim()

export function mentionedHost(text: string): boolean {
  return MENTION_RE.test(text)
}

interface ReplyArgs {
  hostId: HostId
  messageHistory: Array<{ role: 'host' | 'user'; name: string; text: string }>
  userMessage: string
  userName: string
  callerUid: string
}

export async function generateHostReply(args: ReplyArgs): Promise<string | null> {
  // Rate-limit BEFORE the LLM call so a stuck call doesn't burn the day budget.
  const cap = await bumpAndCheck(args.callerUid, 'host-day', CHAT_LIMITS.hostRepliesPerDay)
  if (!cap.allowed) {
    return null
  }

  const apiKey = process.env.GEMINI_API_KEY ?? GEMINI_API_KEY.value()
  if (!apiKey) {
    console.warn('hostChatReply: no GEMINI_API_KEY in env or secret store.')
    return null
  }

  const systemPrompt = HOST_PERSONAS[args.hostId] + SYSTEM_SUFFIX

  const historyBlock = args.messageHistory
    .map((m) => `${m.role === 'host' ? `${m.name} (host)` : m.name}: ${m.text}`)
    .join('\n')

  const userPrompt = [
    historyBlock,
    `${args.userName}: ${args.userMessage}`,
    ``,
    `Your reply (1-2 sentences, in your voice):`,
  ].join('\n')

  try {
    const text = await Promise.race([
      callGemini({ apiKey, systemPrompt, userPrompt, temperature: 0.8, maxOutputTokens: 200 }),
      timeoutAfter(TIMEOUT_MS),
    ])
    if (!text || text.length < 4) return null
    // Strip any quotation marks the model added around its reply.
    return text.replace(/^["']|["']$/g, '').trim()
  } catch (err) {
    console.warn('hostChatReply LLM call failed:', err)
    return null
  }
}

function timeoutAfter(ms: number): Promise<string> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('hostChatReply timeout')), ms))
}
