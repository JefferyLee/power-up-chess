#!/usr/bin/env tsx
// Generate one image via Replicate's google/nano-banana-pro and save to
// tools/generate-image/output/. Designed as a thin CLI on top of the
// Replicate SDK so we (a) keep the API key in one .env file and (b) can
// script batch runs from package.json or shell loops.
//
// Usage from repo root:
//   pnpm --filter @power-up-chess/generate-image gen \
//     --label knight-front-v1 \
//     --prompt-file prompts/knight-front.txt
//
// Or with inline prompt:
//   pnpm --filter @power-up-chess/generate-image gen \
//     --label test \
//     --prompt "a friendly cartoon knight"
//
// Prompts file should be plain text — no YAML / JSON wrapping. Newlines
// are preserved so multi-paragraph prompts work.

import { config as loadEnv } from 'dotenv'
import Replicate from 'replicate'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const toolRoot = resolve(here, '..')
loadEnv({ path: resolve(toolRoot, '.env') })

const OUTPUT_DIR = resolve(toolRoot, 'output')
const PROMPTS_DIR = resolve(toolRoot, 'prompts')

interface Args {
  label: string
  prompt: string
  ratio: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Partial<Args> & { promptFile?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--label') args.label = argv[++i]
    else if (a === '--prompt') args.prompt = argv[++i]
    else if (a === '--prompt-file') args.promptFile = argv[++i]
    else if (a === '--ratio') args.ratio = argv[++i]
  }
  if (!args.label) bail('--label is required')
  if (!args.prompt && !args.promptFile) bail('--prompt or --prompt-file is required')
  if (args.promptFile && !args.prompt) {
    const path = args.promptFile.startsWith('/')
      ? args.promptFile
      : resolve(PROMPTS_DIR, args.promptFile)
    args.prompt = readFileSync(path, 'utf8').trim()
  }
  return {
    label: args.label!,
    prompt: args.prompt!,
    ratio: args.ratio ?? '1:1',
  }
}

function bail(msg: string): never {
  console.error(`error: ${msg}`)
  process.exit(2)
}

async function main(): Promise<void> {
  const args = parseArgs()
  const token = process.env.REPLICATE_API_TOKEN
  if (!token) {
    bail('REPLICATE_API_TOKEN not set in tools/generate-image/.env')
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const replicate = new Replicate({ auth: token })
  console.error(`[gen] ${args.label} — calling google/nano-banana-pro …`)

  // nano-banana-pro is Google's image model on Replicate. Inputs:
  //   prompt: string
  //   aspect_ratio: "1:1" | "9:16" | "16:9" | etc.
  //   output_format: "png" | "jpg"
  //   safety_tolerance: 0–6 (higher = looser)
  const output = await replicate.run('google/nano-banana-pro', {
    input: {
      prompt: args.prompt,
      aspect_ratio: args.ratio,
      output_format: 'png',
      safety_tolerance: 5,
    },
  })

  // Replicate returns a stream-like or array of URLs; nano-banana-pro
  // typically returns a single file. Normalise to a fetchable URL.
  const url = await resolveUrl(output)
  if (!url) {
    console.error('[gen] output:', JSON.stringify(output).slice(0, 400))
    bail('Replicate returned no usable URL')
  }
  console.error(`[gen] downloading ${url}`)

  const buf = await fetch(url).then((r) => r.arrayBuffer())
  const filename = `${args.label}-${timestamp()}.png`
  const filepath = resolve(OUTPUT_DIR, filename)
  writeFileSync(filepath, Buffer.from(buf))
  console.error(`[gen] saved ${filepath} (${(buf.byteLength / 1024).toFixed(1)} KB)`)

  // Final stdout = JSON for scripting.
  process.stdout.write(JSON.stringify({ label: args.label, path: filepath, url }) + '\n')
}

async function resolveUrl(output: unknown): Promise<string | null> {
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output.length > 0) {
    return resolveUrl(output[0])
  }
  // Replicate's newer SDK returns `FileOutput` objects with a `.url()` method.
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>
    if (typeof obj.url === 'function') {
      const u = await (obj.url as () => Promise<string | URL>)()
      return u instanceof URL ? u.toString() : u
    }
    if (typeof obj.url === 'string') return obj.url
  }
  return null
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

main().catch((e) => {
  console.error('[gen] failed:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
