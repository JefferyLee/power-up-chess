// Stage 2 — feed each chunk to Gemini and ask "find any chess stories worth
// retelling to a child". Output is a list of StoryCandidate objects.
//
// Key constraints in the prompt:
//   - 2-5 sentences, ORIGINAL wording (never copy book phrases)
//   - Skip anything that can't be retold without quoting
//   - Skip technical move analysis; we want narratives
//
// Cached by chunkId so re-runs are free.

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { execSync } from 'node:child_process'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { BOOKS } from './books.js'
import { CANDIDATES_JSON, CHUNKS_DIR, HARVEST_CACHE } from './paths.js'
import type { StoryCandidate, TextChunk } from './types.js'

const MODEL = 'gemini-3.5-flash'

const SYSTEM_PROMPT = `
You are an editor pulling brief, retellable chess STORIES from book text for
an 8-10 year old reader. Read the chunk and return any historical anecdotes,
moments from famous games or tournaments, player personality snippets, or
opening/era lore that a friendly host could tell aloud in 10 seconds.

For each story found, return:
  - title:   short, evocative (≤ 60 chars). Use your own words.
  - body:    2-5 sentences retelling the story IN YOUR OWN WORDS. Do NOT
             copy phrases from the source. Never quote. If you cannot retell
             without quoting, SKIP this story.
  - era:     short label like "ancient", "1500s", "1920s", "modern".
  - players: array of player names mentioned (Capablanca, Polgár, ...). Empty
             if the story is purely about positions or eras.
  - motif:   one of [history, anecdote, game, tournament, opening, tactic].

Skip:
  - Move sequences without narrative ("1.e4 e5 2.Nf3 ...")
  - Pure tactical analysis without a story
  - Anything that requires copying the source to make sense
  - Personal opinions of the book's author about a position
  - Anything you are not confident about historically

If the chunk has nothing storylike, return { "stories": [] }. Quality > quantity.
`.trim()

interface HarvestCacheStory {
  title: string
  body: string
  era?: string
  players?: string[]
  motif: string
}
interface HarvestCacheEntry {
  stories: HarvestCacheStory[]
}
type HarvestCache = Record<string, HarvestCacheEntry>

export async function runHarvest(): Promise<void> {
  const apiKey = resolveApiKey()
  if (!apiKey) throw new Error('GEMINI_API_KEY not set. Run with GEMINI_API_KEY=… pnpm harvest')

  const client = new GoogleGenerativeAI(apiKey)
  const model = client.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2500,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          stories: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                body: { type: SchemaType.STRING },
                era: { type: SchemaType.STRING },
                players: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                motif: { type: SchemaType.STRING },
                bookId: { type: SchemaType.STRING },
                sourcePage: { type: SchemaType.STRING },
              },
              required: ['title', 'body', 'motif'],
            },
          },
        },
        required: ['stories'],
      },
    },
  })

  const cache = await loadCache()
  const allCandidates: StoryCandidate[] = []
  let liveCalls = 0
  let cacheSinceFlush = 0

  for (const book of BOOKS) {
    const chunkFiles = (await readdir(CHUNKS_DIR)).filter((f) => f === `${book.bookId}.json`)
    if (chunkFiles.length === 0) continue
    const allChunks: TextChunk[] = JSON.parse(await readFile(`${CHUNKS_DIR}/${book.bookId}.json`, 'utf8'))
    // Optional per-book limit, useful for a first cheap pass before
    // burning API budget on the whole library.
    const limitEnv = process.env.STORY_HARVEST_LIMIT_PER_BOOK
    const limit = limitEnv ? Number(limitEnv) : allChunks.length
    const chunks = allChunks.slice(0, Math.max(1, limit))
    console.log(`  ${book.bookId}: processing ${chunks.length}/${allChunks.length} chunks (cache hits: ${chunks.filter((c) => cache[c.chunkId]).length})`)

    for (const chunk of chunks) {
      let entry = cache[chunk.chunkId]
      if (!entry) {
        liveCalls++
        entry = (await tryHarvest(model, chunk)) ?? { stories: [] }
        cache[chunk.chunkId] = entry
        cacheSinceFlush++
        if (cacheSinceFlush >= 5) {
          await saveCache(cache)
          cacheSinceFlush = 0
        }
        await sleep(150)
      }
      for (const s of entry.stories) {
        const slug = slugify(s.title).slice(0, 32)
        const id = `${book.bookId}-${slug || (chunk.chunkId.split('-').pop() ?? 'x')}`
        const candidate: StoryCandidate = {
          id,
          bookId: book.bookId,
          title: s.title,
          body: s.body,
          motif: s.motif,
          sourceChunkId: chunk.chunkId,
        }
        if (s.era) candidate.era = s.era
        if (s.players?.length) candidate.players = s.players
        const page = pageRangeFor(chunk)
        if (page) candidate.sourcePage = page
        allCandidates.push(candidate)
      }
    }
  }
  await saveCache(cache)

  // Deduplicate by id, keeping the first occurrence.
  const seen = new Set<string>()
  const unique = allCandidates.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  await writeFile(CANDIDATES_JSON, JSON.stringify(unique, null, 2))
  console.log(`Wrote ${unique.length} candidates → ${CANDIDATES_JSON} (${liveCalls} live calls, ${allCandidates.length - unique.length} dedupes)`)
}

async function tryHarvest(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  chunk: TextChunk,
): Promise<HarvestCacheEntry | null> {
  const userPrompt = [
    `Source book id: ${chunk.bookId}`,
    `Approximate page range: ${pageRangeFor(chunk)}`,
    ``,
    `--- CHUNK START ---`,
    chunk.text,
    `--- CHUNK END ---`,
  ].join('\n')

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(userPrompt)
      const text = result.response.text().trim()
      const json = parseJsonLoose(text)
      const stories = Array.isArray(json.stories) ? json.stories : []
      return {
        stories: stories
          .filter((s: unknown): s is { title: unknown; body: unknown; motif: unknown } =>
            typeof s === 'object' && s !== null && 'title' in s && 'body' in s && 'motif' in s,
          )
          .map((s) => ({
            title: String(s.title).trim(),
            body: String(s.body).trim(),
            era: 'era' in s ? String((s as { era?: unknown }).era ?? '').trim() : undefined,
            players: 'players' in s && Array.isArray((s as { players?: unknown }).players)
              ? ((s as { players: unknown[] }).players.map(String))
              : [],
            motif: String(s.motif).trim().toLowerCase(),
          }))
          .filter((s) => s.title.length > 0 && s.body.length > 30),
      }
    } catch (err) {
      if (attempt === 1) {
        console.warn(`  skip chunk ${chunk.chunkId}: ${(err as Error).message.slice(0, 120)}`)
        return null
      }
      await sleep(800)
    }
  }
  return null
}

function pageRangeFor(chunk: TextChunk): string {
  if (chunk.pageStart && chunk.pageEnd) {
    return chunk.pageStart === chunk.pageEnd ? `p.${chunk.pageStart}` : `pp.${chunk.pageStart}-${chunk.pageEnd}`
  }
  return ''
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function parseJsonLoose(s: string): { stories?: unknown } {
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

async function loadCache(): Promise<HarvestCache> {
  try {
    return JSON.parse(await readFile(HARVEST_CACHE, 'utf8'))
  } catch {
    return {}
  }
}

async function saveCache(cache: HarvestCache): Promise<void> {
  await writeFile(HARVEST_CACHE, JSON.stringify(cache, null, 2))
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
