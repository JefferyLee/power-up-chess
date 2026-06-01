// Build-time helper: collect every story JSON from data/stories/ into a
// single lib/stories.bundle.json that the deployed function can read at
// cold start. Runs as part of `pnpm build` so the bundle is always fresh.
//
// We deliberately do NOT import via TypeScript JSON modules — 108 individual
// imports would balloon the .js output and make tsc rebuilds slow. A single
// runtime read is cheaper and keeps the function source small.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const STORIES_SRC = resolve(here, '../../data/stories')
const STORIES_OUT = resolve(here, '../lib/stories.bundle.json')

async function main() {
  await mkdir(dirname(STORIES_OUT), { recursive: true })
  const entries = await readdir(STORIES_SRC)
  const files = entries.filter((f) => f.endsWith('.json') && f !== 'manifest.json')

  const stories = []
  for (const f of files) {
    const raw = await readFile(`${STORIES_SRC}/${f}`, 'utf8')
    const story = JSON.parse(raw)
    // Strip fields the function doesn't need — keeps the bundle tight.
    stories.push({
      id: story.id,
      title: story.title,
      variants: story.variants,
      motif: story.motif,
      era: story.era,
      source: {
        book: story.source?.book,
        author: story.source?.author,
      },
    })
  }

  await writeFile(STORIES_OUT, JSON.stringify({ count: stories.length, stories }))
  console.log(`bundled ${stories.length} stories → ${STORIES_OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
