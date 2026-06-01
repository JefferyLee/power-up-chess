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
}

export async function callGemini(opts: GeminiCallOptions): Promise<string> {
  const client = getClient(opts.apiKey)
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: opts.systemPrompt,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxOutputTokens ?? 120,
    },
  })
  const result = await model.generateContent(opts.userPrompt)
  const text = result.response.text().trim()
  return text
}
