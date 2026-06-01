// Stage 3 — for each candidate, generate Lucy and Luca voice variants.
//
// Each variant is a stand-alone retelling, 2-4 sentences, in that host's
// voice (Lucy = warm/calm/teacher; Luca = playful/adventure-minded). Same
// hard rules as commentary: no false claims, never quote the source.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { CANDIDATES_JSON, VOICE_CACHE, VOICED_JSON } from './paths.js'
import type { StoryCandidate, VoicedStory } from './types.js'

const MODEL = 'gemini-3.5-flash'

const SYSTEM_PROMPT = `
Rewrite a chess story in TWO voices for an 8-10 year old listener.

Voice A — Lucy: warm, calm, like a kind teacher who loves chess. Magical but
not babyish. Notices small details. Uses gentle language.

Voice B — Luca: playful, energetic, adventure-flavoured. Loves brave plans
and sharp moments. Friendly and a little dramatic, but never rough.

Hard rules for BOTH voices:
- 2-4 sentences each. Concrete. Easy to say aloud.
- Tell the story IN YOUR OWN WORDS. Do NOT copy phrases from the input.
- Never invent facts. If the input is unclear, generalise rather than guess.
- No empty praise. No filler ("isn't that cool?").
- Stay in voice — don't add headers, emoji, or speaker labels.

Return JSON: { "lucy": "...", "luca": "..." }
`.trim()

type VoiceCache = Record<string, { lucy: string; luca: string }>

export async function runVoice(): Promise<void> {
  const apiKey = resolveApiKey()
  if (!apiKey) throw new Error('GEMINI_API_KEY not set. Run with GEMINI_API_KEY=… pnpm voice')

  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 2500,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          lucy: { type: SchemaType.STRING },
          luca: { type: SchemaType.STRING },
        },
        required: ['lucy', 'luca'],
      },
    },
  })

  const candidates: StoryCandidate[] = JSON.parse(await readFile(CANDIDATES_JSON, 'utf8'))
  const cache = await loadCache()
  console.log(`${candidates.length} candidates; cache hits: ${candidates.filter((c) => cache[c.id]).length}`)

  const voiced: VoicedStory[] = []
  let liveCalls = 0
  let cacheSinceFlush = 0

  for (const c of candidates) {
    let variants: { lucy: string; luca: string } | undefined = cache[c.id]
    if (!variants) {
      liveCalls++
      const fresh = await tryVoice(model, c)
      if (fresh) {
        variants = fresh
        cache[c.id] = fresh
        cacheSinceFlush++
        if (cacheSinceFlush >= 5) {
          await saveCache(cache)
          cacheSinceFlush = 0
        }
      }
      await sleep(150)
    }
    if (variants) {
      voiced.push({ ...c, variants })
    }
    if (voiced.length > 0 && voiced.length % 25 === 0) {
      console.log(`  voiced ${voiced.length}/${candidates.length} (live calls: ${liveCalls})`)
    }
  }
  await saveCache(cache)
  await writeFile(VOICED_JSON, JSON.stringify(voiced, null, 2))
  console.log(`Wrote ${voiced.length} voiced stories → ${VOICED_JSON} (${liveCalls} live calls)`)
}

async function tryVoice(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  c: StoryCandidate,
): Promise<{ lucy: string; luca: string } | null> {
  const userPrompt = [
    `Title: ${c.title}`,
    `Era: ${c.era ?? '(unspecified)'}`,
    `Players: ${(c.players ?? []).join(', ') || '(none mentioned)'}`,
    `Motif: ${c.motif}`,
    ``,
    `Original retelling (input):`,
    c.body,
    ``,
    `Return JSON: { "lucy": "...", "luca": "..." }`,
  ].join('\n')

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(userPrompt)
      const text = result.response.text().trim()
      const json = parseJsonLoose(text)
      const lucy = String(json.lucy ?? '').trim()
      const luca = String(json.luca ?? '').trim()
      if (lucy.length < 20 || luca.length < 20) throw new Error(`Voice too short: lucy=${lucy.length} luca=${luca.length}`)
      return { lucy, luca }
    } catch (err) {
      if (attempt === 1) {
        console.warn(`  skip ${c.id}: ${(err as Error).message.slice(0, 120)}`)
        return null
      }
      await sleep(600)
    }
  }
  return null
}

function parseJsonLoose(s: string): { lucy?: unknown; luca?: unknown } {
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error(`Could not parse JSON from: ${s.slice(0, 200)}`)
  }
}

async function loadCache(): Promise<VoiceCache> {
  try {
    return JSON.parse(await readFile(VOICE_CACHE, 'utf8'))
  } catch {
    return {}
  }
}

async function saveCache(cache: VoiceCache): Promise<void> {
  await writeFile(VOICE_CACHE, JSON.stringify(cache, null, 2))
}

function resolveApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const out = execSync('firebase functions:secrets:access GEMINI_API_KEY', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })
    return out.trim() || null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
