// Thin wrapper around the @google/generative-ai SDK so the rest of the
// commentary module doesn't have to know about model setup.

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'

const MODEL = 'gemini-3.5-flash'

// Every host string in the app is read by an 8-10 year old, so run the
// strictest blocking tier on all four harm categories. This is the single
// Gemini entry point — every caller inherits these settings (Phase 1.6).
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
]

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

/** callGemini raced against a hard timeout (Phase 3.3) — callers use this
 *  to guarantee a structured fallback instead of a hung/naked-500 response. */
export async function callGeminiWithTimeout(opts: GeminiCallOptions, timeoutMs = 8000): Promise<string> {
  return Promise.race([
    callGemini(opts),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`gemini timeout after ${timeoutMs}ms`)), timeoutMs)),
  ])
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
    safetySettings: SAFETY_SETTINGS,
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
