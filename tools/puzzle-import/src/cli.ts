// Lichess puzzle import pipeline.
//
// Stages (run in order, but each can be invoked individually for development):
//   fetch    - download lichess_db_puzzle.csv.zst into ./work
//   filter   - stream-decompress + filter to Ada-band candidates → work/filtered.jsonl
//   sample   - stratified deterministic sample → work/selection.json
//   explain  - per-puzzle LLM explanation (cached) → work/explained.json
//   emit     - write data/puzzles/lichess.json + manifest + README
//   all      - run every stage in sequence
//
// Env:
//   GEMINI_API_KEY required for the `explain` stage. Falls back to a try
//   against `firebase functions:secrets:access GEMINI_API_KEY` if unset.

import { runFetch } from './fetch.js'
import { runFilter } from './filter.js'
import { runSample } from './sample.js'
import { runExplain } from './explain.js'
import { runEmit } from './emit.js'

const STAGES = ['fetch', 'filter', 'sample', 'explain', 'emit'] as const
type Stage = (typeof STAGES)[number]

async function main(): Promise<void> {
  const arg = process.argv[2] ?? 'all'
  if (arg === 'all') {
    for (const s of STAGES) {
      console.log(`\n=== ${s} ===\n`)
      await run(s)
    }
    return
  }
  if ((STAGES as readonly string[]).includes(arg)) {
    await run(arg as Stage)
    return
  }
  console.error(`Unknown stage: ${arg}. Use one of: ${STAGES.join(', ')} | all`)
  process.exit(1)
}

async function run(stage: Stage): Promise<void> {
  switch (stage) {
    case 'fetch':   return runFetch()
    case 'filter':  return runFilter()
    case 'sample':  return runSample()
    case 'explain': return runExplain()
    case 'emit':    return runEmit()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
