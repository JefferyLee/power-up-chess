// Stage 3 — stratified deterministic sample from the filtered candidates.
//
// Target shape: 5,000 puzzles in the main rating band (400-3000) plus 100
// "Legends" puzzles at 3000+. Within the main band we stratify by
// (plot × rating-band) and weight lower bands more heavily so beginners
// have lots to chew on without starving stronger kids. Same input → same
// output (mulberry32 seeded).

import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { FILTERED_JSONL, SELECTION_JSON } from './paths.js'
import type { FilteredEntry } from './types.js'
import { PLOTS } from './types.js'

const SEED = 0x9e3779b9
const LEGENDS_TARGET = 100
const LEGENDS_MIN_RATING = 3000

/** Rating bands × per-band sample target. Sum is the main-band total.
 *  Each band's quota is split evenly across the 6 plots. */
const BANDS: Array<{ lo: number; hi: number; target: number }> = [
  { lo: 400,  hi: 700,  target: 1500 },
  { lo: 700,  hi: 1100, target: 1500 },
  { lo: 1100, hi: 1500, target: 900 },
  { lo: 1500, hi: 1900, target: 600 },
  { lo: 1900, hi: 2400, target: 400 },
  { lo: 2400, hi: 3000, target: 100 },
]
// Sum: 5000. Per (band × plot) target = target / 6, rounded up so we
// don't lose puzzles to division.

export async function runSample(): Promise<void> {
  // Bucket key: `band:plot` for main, `legends:plot` for ≥3000.
  const buckets = new Map<string, FilteredEntry[]>()

  const rl = createInterface({ input: createReadStream(FILTERED_JSONL), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const entry = JSON.parse(line) as FilteredEntry
    const key = bucketKey(entry)
    if (!key) continue
    let arr = buckets.get(key)
    if (!arr) {
      arr = []
      buckets.set(key, arr)
    }
    arr.push(entry)
  }

  const rng = mulberry32(SEED)
  const selection: FilteredEntry[] = []

  // Main bands.
  console.log('Main band sampling (5,000 target):')
  for (const band of BANDS) {
    const perPlot = Math.ceil(band.target / PLOTS.length)
    let bandKept = 0
    for (const plot of PLOTS) {
      const key = `${band.lo}-${band.hi}:${plot}`
      const list = buckets.get(key) ?? []
      const shuffled = shuffle(list, rng)
      const take = shuffled.slice(0, perPlot).sort((a, b) => a.rating - b.rating)
      bandKept += take.length
      selection.push(...take)
    }
    console.log(`  ${band.lo}-${band.hi}: target ${band.target}, kept ${bandKept}`)
  }

  // Legends — first pass per-plot for variety, then a global top-up
  // pulling from any remaining 3000+ candidates to hit the target.
  console.log('Legends sampling (100 target):')
  const perPlotLegends = Math.ceil(LEGENDS_TARGET / PLOTS.length)
  const takenLegends = new Set<string>()
  let legendsKept = 0
  for (const plot of PLOTS) {
    const key = `legends:${plot}`
    const list = buckets.get(key) ?? []
    const shuffled = shuffle(list, rng)
    const take = shuffled.slice(0, perPlotLegends).sort((a, b) => a.rating - b.rating)
    for (const e of take) takenLegends.add(e.puzzleId)
    legendsKept += take.length
    selection.push(...take)
  }
  if (legendsKept < LEGENDS_TARGET) {
    const remaining: FilteredEntry[] = []
    for (const plot of PLOTS) {
      const list = buckets.get(`legends:${plot}`) ?? []
      for (const e of list) {
        if (!takenLegends.has(e.puzzleId)) remaining.push(e)
      }
    }
    const topUp = shuffle(remaining, rng).slice(0, LEGENDS_TARGET - legendsKept)
    selection.push(...topUp)
    legendsKept += topUp.length
    console.log(`  legends top-up: +${topUp.length}`)
  }
  console.log(`  legends: target ${LEGENDS_TARGET}, kept ${legendsKept}`)

  // Final dedupe — a puzzle can only fall in one bucket, but belt-and-braces.
  const seen = new Set<string>()
  const final = selection.filter((e) => {
    if (seen.has(e.puzzleId)) return false
    seen.add(e.puzzleId)
    return true
  })
  final.sort((a, b) => a.rating - b.rating)

  await writeFile(SELECTION_JSON, JSON.stringify(final, null, 2))
  console.log(`\nSampled ${final.length} puzzles → ${SELECTION_JSON}`)

  const byPlot: Record<string, number> = {}
  for (const e of final) byPlot[e.plot] = (byPlot[e.plot] ?? 0) + 1
  console.log('  Plot totals:', byPlot)
}

function bucketKey(entry: FilteredEntry): string | null {
  if (entry.rating >= LEGENDS_MIN_RATING) {
    return `legends:${entry.plot}`
  }
  for (const band of BANDS) {
    if (entry.rating >= band.lo && entry.rating < band.hi) {
      return `${band.lo}-${band.hi}:${entry.plot}`
    }
  }
  return null
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
