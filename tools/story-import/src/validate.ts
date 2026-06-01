// Stage 4 — drop stories that quote the source or fail basic sanity checks.
//
// Anti-verbatim guardrail (§6.5 of MVP2_PLAN): if any rolling 30-character
// window from body / lucy / luca variants also appears in the source chunk,
// reject. This is a coarse but cheap check; the LLM is told not to copy, this
// catches the cases where it ignores us.
//
// Sanity: non-empty title, non-empty body, motif in known set, no obviously
// implausible years.

import { readFile, writeFile } from 'node:fs/promises'
import { CANDIDATES_JSON, CHUNKS_DIR, VALIDATED_JSON, VOICED_JSON } from './paths.js'
import type { TextChunk, VoicedStory } from './types.js'

const VERBATIM_WINDOW = 30
const KNOWN_MOTIFS = new Set(['history', 'anecdote', 'game', 'tournament', 'opening', 'tactic'])
const MIN_YEAR = 700
const MAX_YEAR = new Date().getFullYear() + 1

export async function runValidate(): Promise<void> {
  const voiced: VoicedStory[] = JSON.parse(await readFile(VOICED_JSON, 'utf8'))
  // Re-read candidates to know which chunk each came from (sourceChunkId).
  const candidates = JSON.parse(await readFile(CANDIDATES_JSON, 'utf8')) as VoicedStory[]
  const sourceChunkById = new Map(candidates.map((c) => [c.id, c.sourceChunkId]))

  // Cache chunk text by id, loaded lazily per book file.
  const chunkTextCache = new Map<string, string>()
  await loadAllChunks(chunkTextCache)

  const kept: VoicedStory[] = []
  const dropped: Array<{ id: string; reason: string }> = []

  for (const story of voiced) {
    const reason = problemFor(story, sourceChunkById, chunkTextCache)
    if (reason) {
      dropped.push({ id: story.id, reason })
      continue
    }
    kept.push(story)
  }

  await writeFile(VALIDATED_JSON, JSON.stringify(kept, null, 2))
  console.log(`Kept ${kept.length} / ${voiced.length} stories; dropped ${dropped.length}`)
  if (dropped.length > 0) {
    console.log(`First dropped reasons:`)
    for (const d of dropped.slice(0, 12)) {
      console.log(`  ${d.id}  →  ${d.reason}`)
    }
  }
}

function problemFor(
  story: VoicedStory,
  sourceChunkById: Map<string, string>,
  chunkText: Map<string, string>,
): string | null {
  if (!story.title.trim()) return 'empty title'
  if (story.body.trim().length < 40) return 'body too short'
  if (!KNOWN_MOTIFS.has(story.motif)) return `unknown motif: ${story.motif}`
  if (story.era && !plausibleEra(story.era)) return `implausible era: ${story.era}`
  if (!story.variants?.lucy || !story.variants?.luca) return 'missing voice variant'
  if (story.variants.lucy.trim().length < 30) return 'lucy variant too short'
  if (story.variants.luca.trim().length < 30) return 'luca variant too short'

  const chunkId = sourceChunkById.get(story.id)
  if (!chunkId) return 'no source chunk recorded'
  const sourceText = chunkText.get(chunkId)
  if (!sourceText) {
    // Source chunk unavailable — can't anti-verbatim, accept conservatively.
    return null
  }

  const candidate = `${story.body}\n${story.variants.lucy}\n${story.variants.luca}`.toLowerCase()
  const source = sourceText.toLowerCase()
  const overlap = findVerbatimWindow(candidate, source, VERBATIM_WINDOW)
  if (overlap) return `verbatim ≥${VERBATIM_WINDOW} chars: "${overlap.slice(0, 60)}…"`

  return null
}

function plausibleEra(era: string): boolean {
  // Accept words ("ancient", "modern", "1500s") or any 4-digit year in range.
  const yearMatch = era.match(/(\d{3,4})/)
  if (!yearMatch) return true
  const y = Number(yearMatch[1])
  return y >= MIN_YEAR && y <= MAX_YEAR
}

function findVerbatimWindow(a: string, b: string, n: number): string | null {
  if (a.length < n) return null
  // Build a set of all n-grams from `b`, then scan `a`.
  const grams = new Set<string>()
  for (let i = 0; i + n <= b.length; i++) {
    grams.add(b.slice(i, i + n))
  }
  for (let i = 0; i + n <= a.length; i++) {
    const g = a.slice(i, i + n)
    if (grams.has(g)) return g
  }
  return null
}

async function loadAllChunks(cache: Map<string, string>): Promise<void> {
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(CHUNKS_DIR)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const chunks: TextChunk[] = JSON.parse(await readFile(`${CHUNKS_DIR}/${f}`, 'utf8'))
    for (const c of chunks) cache.set(c.chunkId, c.text)
  }
}
