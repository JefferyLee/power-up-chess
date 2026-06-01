import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { commentaryHash, readCachedCommentary, writeCachedCommentary } from './cache'
import { callGemini } from './gemini'
import { HOST_PERSONAS, type HostId } from './personas'

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

export interface GameRecapRequest {
  host: HostId
  pgn: string
  /** Quick counts of each classification across the game. */
  summary: {
    best?: number
    excellent?: number
    good?: number
    inaccuracy?: number
    mistake?: number
    blunder?: number
    brilliant?: number
  }
  /** White-POV result: 'white' | 'black' | 'draw'. */
  result: 'white' | 'black' | 'draw'
  whiteName: string
  blackName: string
  /** The name we should address the recap to (usually the local player). */
  playerName: string
  isAdaSpecialMode?: boolean
}

export interface GameRecapResponse {
  text: string
  source: 'cache' | 'llm'
}

export const gameRecap = onCall<GameRecapRequest, Promise<GameRecapResponse>>(
  { secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Sign in before requesting a recap.')
    }
    const data = req.data
    if (!HOST_PERSONAS[data.host]) {
      throw new HttpsError('invalid-argument', 'Invalid host.')
    }
    if (typeof data.pgn !== 'string' || data.pgn.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Missing pgn.')
    }
    const playerName = (data.playerName ?? '').toString().trim().slice(0, 32)

    // Cache by host + PGN + audience (player name). Same game replay should
    // produce a deterministic recap for the same audience.
    const hash = commentaryHash([data.host, 'recap', data.pgn, playerName])
    const cached = await readCachedCommentary(hash)
    if (cached) {
      return { text: cached, source: 'cache' }
    }

    const userPrompt = buildPrompt(data, playerName)

    const text = await callGemini({
      apiKey: GEMINI_API_KEY.value(),
      systemPrompt: HOST_PERSONAS[data.host],
      userPrompt,
      temperature: 0.7,
      maxOutputTokens: 280,
    })

    const clipped = text.trim()
    writeCachedCommentary(hash, clipped, 'gemini-3.5-flash').catch(() => {})
    return { text: clipped, source: 'llm' }
  },
)

function buildPrompt(data: GameRecapRequest, playerName: string): string {
  const s = data.summary
  const counts: string[] = []
  if (s.brilliant) counts.push(`${s.brilliant} brilliant`)
  if (s.best) counts.push(`${s.best} best`)
  if (s.excellent) counts.push(`${s.excellent} excellent`)
  if (s.inaccuracy) counts.push(`${s.inaccuracy} inaccuracy`)
  if (s.mistake) counts.push(`${s.mistake} mistake`)
  if (s.blunder) counts.push(`${s.blunder} blunder`)
  const countsLine = counts.length > 0 ? counts.join(', ') : 'no especially notable engine flags'

  const resultLine =
    data.result === 'draw'
      ? 'The game ended in a draw.'
      : `${data.result === 'white' ? data.whiteName : data.blackName} won.`

  return [
    `Write a short story-style recap of this chess game for ${playerName || 'the player'}.`,
    `Audience: an 8-10 year old learner around 300-500 rating.`,
    `Tone: warm, honest, encouraging, never fake. Reference 1-2 specific moments if you can, but stay broad — you're a host, not the analyst.`,
    `Length: 3-5 sentences, plain prose, no bullet lists.`,
    ``,
    `Game: ${data.whiteName} (White) vs ${data.blackName} (Black). ${resultLine}`,
    `Move quality breakdown: ${countsLine}.`,
    data.isAdaSpecialMode ? `Ada Special Mode is on.` : null,
    ``,
    `Full PGN:`,
    data.pgn,
  ]
    .filter(Boolean)
    .join('\n')
}
