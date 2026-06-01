// Stage 3 — stratified deterministic sample from the filtered candidates.
//
// Aims for ~30 puzzles per primary motif, ramping from easy to medium within
// each bucket. Same input → same output (mulberry32 seeded).

import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { FILTERED_JSONL, SELECTION_JSON } from './paths.js'
import type { FilteredEntry } from './types.js'

const PER_MOTIF = 30
const SEED = 0x9e3779b9

export async function runSample(): Promise<void> {
  const buckets = new Map<string, FilteredEntry[]>()
  const rl = createInterface({ input: createReadStream(FILTERED_JSONL), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const entry = JSON.parse(line) as FilteredEntry
    const arr = buckets.get(entry.primaryMotif) ?? []
    arr.push(entry)
    buckets.set(entry.primaryMotif, arr)
  }

  const rng = mulberry32(SEED)
  const selection: FilteredEntry[] = []
  for (const [motif, list] of buckets) {
    const shuffled = shuffle(list, rng)
    const take = shuffled.slice(0, PER_MOTIF).sort((a, b) => a.rating - b.rating)
    console.log(`  ${motif}: ${list.length} candidates → ${take.length} sampled`)
    selection.push(...take)
  }
  await writeFile(SELECTION_JSON, JSON.stringify(selection, null, 2))
  console.log(`Sampled ${selection.length} puzzles → ${SELECTION_JSON}`)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}
