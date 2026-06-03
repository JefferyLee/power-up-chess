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
const STORIES_OUT_FUNCTIONS = resolve(here, '../lib/stories.bundle.json')
// Mirrored copy served as a static asset for the web Story Library
// (apps/web/public/ is served from /). Committed alongside the
// source stories so the web build doesn't depend on functions
// having been built first.
const STORIES_OUT_WEB = resolve(here, '../../apps/web/public/stories.bundle.json')

async function main() {
  const entries = await readdir(STORIES_SRC)
  const files = entries.filter((f) => f.endsWith('.json') && f !== 'manifest.json')

  const stories = []
  for (const f of files) {
    const raw = await readFile(`${STORIES_SRC}/${f}`, 'utf8')
    const story = JSON.parse(raw)
    // Strip fields the function + library don't need — keeps the
    // bundle tight while still surfacing book/author for attribution.
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

  const payload = JSON.stringify({ count: stories.length, stories })
  for (const out of [STORIES_OUT_FUNCTIONS, STORIES_OUT_WEB]) {
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, payload)
    console.log(`bundled ${stories.length} stories → ${out}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
