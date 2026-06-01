// Story extraction pipeline.
//
// Stages:
//   extract   - PDF/EPUB → work/raw + work/chunks
//   harvest   - chunks → Gemini → work/candidates.json
//   voice     - candidates → Lucy + Luca variants → work/voiced.json
//   validate  - drop verbatim / sanity-fail → work/validated.json
//   emit      - per-story JSON + manifest + README in data/stories/
//   all       - run every stage in sequence
//
// Env: GEMINI_API_KEY required for harvest + voice. Falls back to
// `firebase functions:secrets:access GEMINI_API_KEY` if unset.

import { runExtract } from './extract.js'
import { runHarvest } from './harvest.js'
import { runVoice } from './voice.js'
import { runValidate } from './validate.js'
import { runEmit } from './emit.js'

const STAGES = ['extract', 'harvest', 'voice', 'validate', 'emit'] as const
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
    case 'extract':  return runExtract()
    case 'harvest':  return runHarvest()
    case 'voice':    return runVoice()
    case 'validate': return runValidate()
    case 'emit':     return runEmit()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
