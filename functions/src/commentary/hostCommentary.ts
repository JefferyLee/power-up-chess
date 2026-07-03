import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { commentaryHash, readCachedCommentary, writeCachedCommentary } from './cache'
import { callGeminiWithTimeout } from './gemini'
import { consumeDailyQuota } from '../llm/rateLimit'
import { HOST_PERSONAS, type HostId } from './personas'

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

// Per-uid LLM cap. A full game review with all notable moves rarely
// exceeds 20 LLM calls; 200/day = 10+ reviews/day, way above any kid
// usage but catches a stuck client retrying in a loop.
const DAILY_LIMIT = 200

const VALID_HOSTS: ReadonlySet<HostId> = new Set<HostId>(['lucy', 'luca'])
const VALID_CLASSIFICATIONS = new Set([
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'brilliant',
])

export interface HostCommentaryRequest {
  host: HostId
  classification: string
  fenBefore: string
  fenAfter: string
  moveSan: string
  moveUci: string
  evalBeforeCp: number
  evalAfterCp: number
  bestMoveSan?: string | null
  bestLineSan?: string[]
  playerName: string
  isAdaSpecialMode?: boolean
}

export interface HostCommentaryResponse {
  text: string
  source: 'cache' | 'llm' | 'fallback'
}

export const hostCommentary = onCall<HostCommentaryRequest, Promise<HostCommentaryResponse>>(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before requesting commentary.')
    }
    const data = req.data
    if (!VALID_HOSTS.has(data.host)) {
      throw new HttpsError('invalid-argument', 'Invalid host.')
    }
    if (!VALID_CLASSIFICATIONS.has(data.classification)) {
      throw new HttpsError('invalid-argument', 'Invalid classification.')
    }
    if (typeof data.fenBefore !== 'string' || typeof data.fenAfter !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing FEN.')
    }
    if (typeof data.moveUci !== 'string' || typeof data.moveSan !== 'string') {
      throw new HttpsError('invalid-argument', 'Missing move.')
    }
    const playerName = (data.playerName ?? '').toString().trim().slice(0, 32)

    // Cache lookup.
    const hash = commentaryHash([
      data.host,
      data.classification,
      data.fenBefore,
      data.moveUci,
      playerName,
    ])
    const cached = await readCachedCommentary(hash)
    if (cached) {
      return { text: cached, source: 'cache' }
    }

    // Cache miss → real LLM call ahead. Charge the daily quota first; the
    // client already has the template fallback ready so a 'resource-
    // exhausted' bubble-up just shows the template line for that move.
    await consumeDailyQuota(req.auth.uid, {
      collection: 'commentary_attempts',
      limit: DAILY_LIMIT,
      noun: 'commentary requests',
    })

    // Build the user prompt as structured context. We keep the schema flat so
    // the model has all the info it needs to be specific without us steering
    // its prose too tightly.
    const userPrompt = buildUserPrompt(data, playerName)

    // Phase 3.3 — server-side fallback: a Gemini timeout / 5xx / safety
    // block returns a warm template line instead of a naked 500 (the client
    // has its own 3s fallback, but slow-not-dead calls used to surface as
    // errors).
    let text: string
    try {
      text = await callGeminiWithTimeout({
        apiKey: GEMINI_API_KEY.value(),
        systemPrompt: HOST_PERSONAS[data.host],
        userPrompt,
        temperature: 0.7,
        maxOutputTokens: 120,
      })
      if (!text.trim()) throw new Error('empty completion')
    } catch (err) {
      console.warn('hostCommentary: LLM failed, template fallback:', err instanceof Error ? err.message : err)
      return { text: fallbackLine(data.classification), source: 'fallback' }
    }

    // Trim to 1-2 sentences if the model went long. Most replies will already
    // be short; this is a safety net.
    const clipped = clipToSentences(text, 2)

    // Best-effort cache write — failures are not fatal to the caller.
    writeCachedCommentary(hash, clipped, 'gemini-3.5-flash').catch(() => {})

    return { text: clipped, source: 'llm' }
  },
)

function buildUserPrompt(data: HostCommentaryRequest, playerName: string): string {
  const bestLine = data.bestLineSan && data.bestLineSan.length > 0
    ? data.bestLineSan.slice(0, 4).join(' ')
    : null
  return [
    `The player ${playerName || '(no name)'} just played the move ${data.moveSan} (${data.moveUci}).`,
    `Classification: ${data.classification}.`,
    `Engine evaluation in centipawns (White's POV): before ${data.evalBeforeCp}, after ${data.evalAfterCp}.`,
    data.bestMoveSan ? `Engine's preferred move was ${data.bestMoveSan}.` : null,
    bestLine ? `Engine's main line was: ${bestLine}.` : null,
    data.isAdaSpecialMode ? `Ada Special Mode is on.` : null,
    `FEN before: ${data.fenBefore}`,
    `FEN after: ${data.fenAfter}`,
    ``,
    `Write 1-2 sentences in your own voice commenting on this move. Be concrete, be honest, be brief.`,
    `This is a post-game review and the player is looking at the board, so naming a move in simple notation (e.g. ${data.moveSan}) is fine when it helps.`,
  ]
    .filter(Boolean)
    .join('\n')
}

function clipToSentences(text: string, maxSentences: number): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const parts = trimmed.match(/[^.!?]+[.!?]+/g)
  if (!parts || parts.length <= maxSentences) return trimmed
  return parts.slice(0, maxSentences).join(' ').trim()
}

/** Server-side template fallback (Phase 3.3) — honest, classification-aware. */
function fallbackLine(classification: string): string {
  switch (classification) {
    case 'brilliant': return 'What a move — genuinely special. Take a bow!'
    case 'blunder': return 'Ouch — that one hurt. Take a breath; the next move is a fresh start.'
    case 'mistake': return 'Not the best square for that piece. See what it left undefended?'
    default: return 'Solid choice. Keep an eye on what your opponent wants to do next.'
  }
}
