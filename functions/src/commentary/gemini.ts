// Thin wrapper around the @google/generative-ai SDK so the rest of the
// commentary module doesn't have to know about model setup.

import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL = 'gemini-3.5-flash'

let cachedClient: GoogleGenerativeAI | null = null
let cachedKey: string | null = null

function getClient(apiKey: string): GoogleGenerativeAI {
  if (cachedClient && cachedKey === apiKey) return cachedClient
  cachedClient = new GoogleGenerativeAI(apiKey)
  cachedKey = apiKey
  return cachedClient
}

export interface GeminiCallOptions {
  apiKey: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxOutputTokens?: number
  /** Force structured output. Gemini honours it strictly for application/json. */
  responseMimeType?: 'text/plain' | 'application/json'
  /** Token budget for internal "thinking" / reasoning on models that
   *  support it (Gemini 2.5+, 3.x). Pass 0 to disable thinking entirely
   *  — needed for short-output tasks (one-question quizzes, 1-2 sentence
   *  replies) where reasoning eats the maxOutputTokens budget before the
   *  model writes anything visible. */
  thinkingBudget?: number
}

export async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const client = getClient(opts.apiKey)
  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.7,
    maxOutputTokens: opts.maxOutputTokens ?? 120,
  }
  if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType
  }
  if (opts.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = { thinkingBudget: opts.thinkingBudget }
  }
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: opts.systemPrompt,
    generationConfig,
  })
  const result = await model.generateContent(opts.userPrompt)
  const text = result.response.text().trim()
  // Diagnostics: surface why the model stopped + how many tokens it
  // actually used. Without this we can't tell MAX_TOKENS from a SAFETY
  // block or a normal STOP at a short answer.
  const candidate = (result.response.candidates ?? [])[0]
  const usage = result.response.usageMetadata
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    console.warn(
      `callGemini: finishReason=${candidate.finishReason}` +
      ` outChars=${text.length}` +
      (usage ? ` candTok=${usage.candidatesTokenCount} promTok=${usage.promptTokenCount}` : ''),
    )
  }
  return text
}
