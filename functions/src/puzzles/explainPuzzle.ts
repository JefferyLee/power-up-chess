// explainPuzzle — a short, host-voiced "why that move works" shown after a kid
// solves a Puzzle Garden puzzle. This is a live host reaction (like the review
// commentary), not pre-authored library content: a puzzle that ships with an
// authored `explanation` uses that (client prefers it); otherwise the client
// calls this, and falls back to a motif template on timeout / template-only.
//
// The move is already engine-confirmed correct (the kid solved it), so the
// prompt only asks WHY — tightly scoped to this puzzle, no outside facts.

import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { commentaryHash, readCachedCommentary, writeCachedCommentary } from '../commentary/cache'
import { callGeminiWithTimeout } from '../commentary/gemini'
import { consumeDailyQuota } from '../llm/rateLimit'
import { HOST_PERSONAS, type HostId } from '../commentary/personas'

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')
const DAILY_LIMIT = 120

export interface ExplainPuzzleRequest {
  host: HostId
  fen: string
  solutionSan: string[]
  motifs?: string[]
}
export interface ExplainPuzzleResponse {
  text: string
  source: 'cache' | 'llm' | 'fallback'
}

export const explainPuzzle = onCall<ExplainPuzzleRequest, Promise<ExplainPuzzleResponse>>(
  { enforceAppCheck: true, secrets: [GEMINI_API_KEY] },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const data = req.data
    if (!HOST_PERSONAS[data.host]) throw new HttpsError('invalid-argument', 'Invalid host.')
    const fen = (data.fen ?? '').toString()
    const san = Array.isArray(data.solutionSan) ? data.solutionSan.slice(0, 8).map(String) : []
    if (!fen || san.length === 0) throw new HttpsError('invalid-argument', 'Missing fen/solution.')
    const motifs = Array.isArray(data.motifs) ? data.motifs.slice(0, 8).map(String) : []

    // Deterministic per (host, position, solution) — same puzzle, same words.
    const hash = commentaryHash([data.host, 'puzzle-explain', fen, san.join(' ')])
    const cached = await readCachedCommentary(hash)
    if (cached) return { text: cached, source: 'cache' }

    await consumeDailyQuota(req.auth.uid, {
      collection: 'puzzle_explain_attempts',
      limit: DAILY_LIMIT,
      noun: 'puzzle explanations',
    })

    const userPrompt = [
      `A child just solved a chess tactics puzzle. The winning move (already played and engine-confirmed correct) is ${san[0]}${san.length > 1 ? ', then ' + san.slice(1).join(', ') : ''}.`,
      motifs.length ? `Tactic type(s): ${motifs.join(', ')}.` : null,
      `In your host voice, warmly explain in 1-2 short sentences WHY this move works — name the tactic in kid-friendly words and point to the concrete idea (a fork hits two pieces at once, a pin freezes a piece, a back-rank mate traps the king, and so on).`,
      `The child is looking at the board, so naming the move (e.g. ${san[0]}) is fine here. Do not invent facts, and do not add anything beyond this one puzzle.`,
      ``,
      `FEN (position just before the move): ${fen}`,
    ]
      .filter(Boolean)
      .join('\n')

    let text: string
    try {
      text = await callGeminiWithTimeout({
      apiKey: GEMINI_API_KEY.value(),
      systemPrompt: HOST_PERSONAS[data.host],
      userPrompt,
      temperature: 0.6,
      maxOutputTokens: 140,
      // Short answer — disable reasoning so the whole budget is visible text.
      thinkingBudget: 0,
      })
      if (!text.trim()) throw new Error('empty completion')
    } catch (err) {
      console.warn('explainPuzzle: LLM failed, fallback:', err instanceof Error ? err.message : err)
      return { text: 'Great solve — you found the winning idea!', source: 'fallback' }
    }
    const clipped = text.trim()
    writeCachedCommentary(hash, clipped, 'gemini-3.5-flash').catch(() => {})
    return { text: clipped, source: 'llm' }
  },
)
