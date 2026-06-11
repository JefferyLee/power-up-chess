// One-off music generation via Replicate MusicGen (meta/musicgen).
// Reuses the image tool's .env token. Usage:
//   node src/gen-music.mjs --label hall-hearth --prompt "..." --duration 30
import { config as loadEnv } from 'dotenv'
import Replicate from 'replicate'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const toolRoot = resolve(here, '..')
loadEnv({ path: resolve(toolRoot, '.env') })

const argv = process.argv.slice(2)
const get = (flag, dflt) => {
  const i = argv.indexOf(flag)
  return i === -1 ? dflt : argv[i + 1]
}
const label = get('--label', 'music')
const prompt = get('--prompt')
const duration = Number(get('--duration', '30'))
if (!prompt) { console.error('--prompt required'); process.exit(2) }

const token = process.env.REPLICATE_API_TOKEN
if (!token) { console.error('no REPLICATE_API_TOKEN'); process.exit(2) }

const replicate = new Replicate({ auth: token })
console.error(`[music] ${label} — meta/musicgen stereo-large, ${duration}s …`)
const output = await replicate.run(
  'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb',
  {
    input: {
      prompt,
      model_version: 'stereo-large',
      duration,
      output_format: 'mp3',
      normalization_strategy: 'peak',
    },
  },
)
let url = null
if (typeof output === 'string') url = output
else if (output && typeof output.url === 'function') {
  const u = await output.url()
  url = u instanceof URL ? u.toString() : u
}
if (!url) { console.error('no URL in output', output); process.exit(1) }
console.error(`[music] downloading ${url}`)
const buf = await fetch(url).then((r) => r.arrayBuffer())
mkdirSync(resolve(toolRoot, 'output'), { recursive: true })
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const out = resolve(toolRoot, 'output', `${label}-${ts}.mp3`)
writeFileSync(out, Buffer.from(buf))
console.error(`[music] saved ${out} (${(buf.byteLength / 1024).toFixed(1)} KB)`)
console.log(JSON.stringify({ label, path: out }))
