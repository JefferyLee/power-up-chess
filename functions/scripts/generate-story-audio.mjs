// Pre-generate mp3 audio for every (story × voice) using the
// `msedge-tts` library which wraps Microsoft Edge's free Neural TTS
// endpoint and stays current with their handshake changes (the
// Sec-MS-GEC challenge introduced in late 2023, etc.).
//
// Run once per content change:
//   pnpm --filter @power-up-chess/functions generate-audio
//
// Outputs to apps/web/public/audio/{storyId}-{voice}.mp3 so the
// Story Library serves them as static assets. Incremental — skips
// files already present.

import { readdir, readFile, mkdir, access } from 'node:fs/promises'
import { constants as fsConstants, createWriteStream } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const here = dirname(fileURLToPath(import.meta.url))
const STORIES_SRC = resolve(here, '../../data/stories')
const AUDIO_OUT = resolve(here, '../../apps/web/public/audio')

const VOICES = {
  lucy: 'en-US-AriaNeural',
  luca: 'en-US-GuyNeural',
}
const CONCURRENCY = 3 // gentle on the endpoint
const RETRY_LIMIT = 3
const RETRY_BACKOFF_MS = 1500

async function main() {
  await mkdir(AUDIO_OUT, { recursive: true })

  const entries = await readdir(STORIES_SRC)
  const files = entries.filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  const stories = []
  for (const f of files) {
    const raw = await readFile(`${STORIES_SRC}/${f}`, 'utf8')
    const story = JSON.parse(raw)
    if (story && story.id && story.variants) stories.push(story)
  }
  console.log(`Found ${stories.length} stories. Generating ${stories.length * 2} (story × voice) pairs.`)

  const jobs = []
  for (const story of stories) {
    for (const [voiceKey, voiceName] of Object.entries(VOICES)) {
      jobs.push({
        outPath: `${AUDIO_OUT}/${story.id}-${voiceKey}.mp3`,
        voiceName,
        text: story.variants[voiceKey],
        label: `${story.id} (${voiceKey})`,
      })
    }
  }

  let done = 0
  let skipped = 0
  let failed = 0
  await runWithConcurrency(jobs, CONCURRENCY, async (job) => {
    if (await fileExists(job.outPath)) {
      skipped++
      return
    }
    let lastErr = null
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        const bytes = await synthesize(job.voiceName, job.text)
        await writeBytes(job.outPath, bytes)
        done++
        console.log(`[${done + skipped + failed}/${jobs.length}] ✓ ${job.label} (${bytes.length} bytes)`)
        return
      } catch (err) {
        lastErr = err
        if (attempt < RETRY_LIMIT) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt))
      }
    }
    failed++
    console.error(`[${done + skipped + failed}/${jobs.length}] ✗ ${job.label}: ${lastErr?.message ?? lastErr}`)
  })

  console.log(`\nGenerated: ${done}, skipped: ${skipped}, failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function runWithConcurrency(items, limit, worker) {
  const cursor = { i: 0 }
  const lanes = Array.from({ length: limit }, async () => {
    while (true) {
      const i = cursor.i++
      if (i >= items.length) return
      await worker(items[i])
    }
  })
  await Promise.all(lanes)
}

async function synthesize(voiceName, text) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const { audioStream } = await tts.toStream(text)
  return await streamToBuffer(audioStream)
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

async function writeBytes(path, bytes) {
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(path)
    ws.on('finish', resolve)
    ws.on('error', reject)
    ws.end(bytes)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
