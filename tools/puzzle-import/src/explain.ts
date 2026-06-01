// Stage 4 — for each sampled puzzle, generate a 1-2 sentence child-friendly
// explanation + 3 hints via gemini-3.5-flash. Cached by puzzleId.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { Chess } from 'chess.js'
import { EXPLAIN_CACHE, EXPLAINED_JSON, SELECTION_JSON } from './paths.js'
import type { FilteredEntry } from './types.js'

const MODEL = 'gemini-3.5-flash'

const SYSTEM_PROMPT = `
You are Lucy — a warm, honest chess host writing for an 8-10 year old learner
(around 300-500 rating).

Produce a JSON object with:
  - explanation: ONE short sentence (≤ 25 words). Say WHAT the move does in
    concrete chess terms (a piece, a square, a threat). No empty praise.
  - hints: exactly 3 strings, each ONE short sentence (≤ 20 words). Hint 1
    nudges the kind of move to look for. Hint 2 names a piece or pattern.
    Hint 3 names the actual move or very close.

Tone: clear, warm, never babyish. Notation OK if it helps clarity.
Brevity is mandatory — long output gets truncated.
`.trim()

interface CacheValue {
  explanation: string
  hints: [string, string, string]
}

export async function runExplain(): Promise<void> {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY not in env, and `firebase functions:secrets:access` failed too. Set GEMINI_API_KEY before running explain.',
    )
  }
  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          explanation: { type: SchemaType.STRING, description: '1-2 sentences naming a piece/square/threat' },
          hints: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            minItems: 3,
            maxItems: 3,
          },
        },
        required: ['explanation', 'hints'],
      },
    },
  })

  const selection: FilteredEntry[] = JSON.parse(await readFile(SELECTION_JSON, 'utf8'))
  const cache = await loadCache()
  console.log(`${selection.length} puzzles; cache hits: ${selection.filter((p) => cache[p.puzzleId]).length}`)

  const explained: Array<FilteredEntry & CacheValue> = []
  const skipped: string[] = []
  let calls = 0
  let cacheSinceFlush = 0

  for (const entry of selection) {
    let value = cache[entry.puzzleId]
    if (!value) {
      calls++
      value = await tryExplain(model, entry, 2)
      if (!value) {
        skipped.push(entry.puzzleId)
        await sleep(120)
        continue
      }
      cache[entry.puzzleId] = value
      cacheSinceFlush++
      if (cacheSinceFlush >= 10) {
        await saveCache(cache)
        cacheSinceFlush = 0
      }
      await sleep(120)
    }
    explained.push({ ...entry, ...value })
    if ((explained.length % 25) === 0) {
      console.log(`  ${explained.length}/${selection.length} (live calls so far: ${calls}, skipped: ${skipped.length})`)
    }
  }
  await saveCache(cache)
  await writeFile(EXPLAINED_JSON, JSON.stringify(explained, null, 2))
  console.log(`Wrote ${explained.length} explained puzzles → ${EXPLAINED_JSON} (${calls} live calls, ${skipped.length} skipped)`)
  if (skipped.length > 0) {
    console.log(`Skipped puzzleIds:`, skipped)
  }
}

async function tryExplain(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  entry: FilteredEntry,
  attempts: number,
): Promise<CacheValue | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await explainOne(model, entry)
    } catch (err) {
      if (i === attempts - 1) {
        console.warn(`  skip ${entry.puzzleId}: ${(err as Error).message.slice(0, 120)}`)
        return null
      }
      await sleep(500)
    }
  }
  return null
}

async function explainOne(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  entry: FilteredEntry,
): Promise<CacheValue> {
  // Build a SAN trace of the solution so the model can reason about moves
  // by piece name rather than algebraic from-to.
  const chess = new Chess(entry.fenAfterSetup)
  const sanLine: string[] = []
  for (const uci of entry.solution) {
    const m = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
    })
    if (m) sanLine.push(m.san)
  }

  const userPrompt = [
    `FEN: ${entry.fenAfterSetup}`,
    `Side to move: ${entry.sideToMove === 'w' ? 'White' : 'Black'}`,
    `Solution (SAN): ${sanLine.join(' ')}`,
    `Solution (UCI): ${entry.solution.join(' ')}`,
    `Themes: ${entry.themes.join(', ')}`,
    `Rating: ${entry.rating}`,
    ``,
    `Return JSON: { "explanation": "...", "hints": ["...", "...", "..."] }`,
  ].join('\n')

  const result = await model.generateContent(userPrompt)
  const text = result.response.text().trim()
  const json = parseJsonLoose(text)
  const explanation = String(json.explanation ?? '').trim()
  const hints = Array.isArray(json.hints) ? json.hints.map(String) : []
  if (!explanation || hints.length !== 3) {
    throw new Error(`Bad LLM output for ${entry.puzzleId}: ${text.slice(0, 200)}`)
  }
  return { explanation, hints: [hints[0]!, hints[1]!, hints[2]!] }
}

function parseJsonLoose(s: string): { explanation?: unknown; hints?: unknown } {
  // Strip ``` fences if the model added them despite instructions.
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fallback: find the outermost {…}
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw new Error(`Could not parse JSON from: ${s.slice(0, 200)}`)
  }
}

async function loadCache(): Promise<Record<string, CacheValue>> {
  try {
    return JSON.parse(await readFile(EXPLAIN_CACHE, 'utf8'))
  } catch {
    return {}
  }
}

async function saveCache(cache: Record<string, CacheValue>): Promise<void> {
  await writeFile(EXPLAIN_CACHE, JSON.stringify(cache, null, 2))
}

function resolveApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const out = execSync('firebase functions:secrets:access GEMINI_API_KEY', {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    })
    const key = out.trim()
    if (key.length > 0) return key
  } catch {
    // ignore — caller will surface the error
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
