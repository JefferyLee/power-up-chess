// Lichess puzzle import pipeline.
//
// Stages:
//   fetch    - download lichess_db_puzzle.csv.zst into ./work
//   filter   - stream-decompress + filter to garden candidates → work/filtered.jsonl
//   sample   - stratified deterministic sample (5000 + 100 legends) → work/selection.json
//   emit     - write data/puzzles/lichess.json + attribution README
//   upload   - push data/puzzles/lichess.json to Firestore at puzzles/{id}
//   explain  - (optional, expensive) per-puzzle LLM explanation → work/explained.json
//   all      - run fetch → filter → sample → emit → upload (skips explain)
//
// `explain` is intentionally outside `all` because 5,000+ Gemini calls are
// slow and pricey; the puzzle UI works fine without it (engine-only feedback).
// Run it on demand when you want to refresh the editorial layer.
//
// Env:
//   GEMINI_API_KEY required for the `explain` stage.
//   GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`
//     required for the `upload` stage.

import { runFetch } from './fetch.js'
import { runFilter } from './filter.js'
import { runSample } from './sample.js'
import { runExplain } from './explain.js'
import { runEmit } from './emit.js'
import { runUpload } from './upload.js'

const ALL_STAGES = ['fetch', 'filter', 'sample', 'emit', 'upload'] as const
const KNOWN = [...ALL_STAGES, 'explain'] as const
type Stage = (typeof KNOWN)[number]

async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'all'
  if (arg === 'all') {
    for (const s of ALL_STAGES) {
      console.log(`\n=== ${s} ===\n`)
      await run(s)
    }
    return
  }
  if ((KNOWN as readonly string[]).includes(arg)) {
    await run(arg as Stage)
    return
  }
  console.error(`Unknown stage: ${arg}. Use one of: ${KNOWN.join(', ')} | all`)
  process.exit(1)
}

async function run(stage: Stage): Promise<void> {
  switch (stage) {
    case 'fetch':   return runFetch()
    case 'filter':  return runFilter()
    case 'sample':  return runSample()
    case 'emit':    return runEmit()
    case 'upload':  return runUpload()
    case 'explain': return runExplain()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
