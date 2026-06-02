#!/usr/bin/env node
// Driver for `/run-power-up-chess`. Launches the Vite dev server, waits
// until the HTML shell + entry bundle return 200, takes a headless
// Chrome screenshot of a given route, then cleans up.
//
// Usage from repo root:
//   node .claude/skills/run-power-up-chess/driver.mjs              # /  (castle gate)
//   node .claude/skills/run-power-up-chess/driver.mjs --route /history
//   node .claude/skills/run-power-up-chess/driver.mjs --width 414 --height 800
//   node .claude/skills/run-power-up-chess/driver.mjs --keep        # leave the server running
//
// If something is already serving on 5173 we reuse it instead of starting
// a new one (so you can `pnpm dev` in another terminal and just take shots).
// Output: prints the absolute path to the screenshot file.

import { spawn } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from 'node:http'
import { setTimeout as wait } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const APP = resolve(REPO, 'apps/web')

const args = parseArgs(process.argv.slice(2))
const PORT = 5173
const URL = `http://localhost:${PORT}${args.route ?? '/'}`
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT = resolve(HERE, args.out ?? 'last-screenshot.png')

try {
  statSync(CHROME)
} catch {
  fail(`Chrome not found at ${CHROME}. On non-macOS, edit driver.mjs.`)
}

let serverProc = null
let startedHere = false

if (await portInUse(PORT)) {
  console.error(`[run] reusing existing server on :${PORT}`)
} else {
  console.error('[run] starting `pnpm dev` in apps/web…')
  serverProc = spawn('pnpm', ['dev'], {
    cwd: APP,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  startedHere = true
  // Forward server output to our stderr so log noise is visible while we wait.
  serverProc.stdout.on('data', (b) => process.stderr.write(`[vite] ${b}`))
  serverProc.stderr.on('data', (b) => process.stderr.write(`[vite!] ${b}`))
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

await waitForServer(URL, 30_000)
console.error(`[run] server is responsive — taking screenshot at ${URL}`)

mkdirSync(dirname(SHOT), { recursive: true })

const width = args.width ?? 1280
const height = args.height ?? 860
const chromeArgs = [
  '--headless=new',
  '--hide-scrollbars',
  '--no-first-run',
  '--disable-gpu',
  '--virtual-time-budget=6000',
  `--window-size=${width},${height}`,
  `--screenshot=${SHOT}`,
  URL,
]

const chromeRes = await new Promise((res) => {
  const p = spawn(CHROME, chromeArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  p.stderr.on('data', (b) => { stderr += b.toString() })
  p.on('exit', (code) => res({ code, stderr }))
})
if (chromeRes.code !== 0) {
  console.error(chromeRes.stderr)
  fail(`Chrome exited with code ${chromeRes.code}`)
}

let size = 0
try { size = statSync(SHOT).size } catch { /* leave at 0 */ }
if (size < 1000) fail(`Screenshot suspiciously small: ${size} bytes`)
console.log(SHOT)
console.error(`[run] wrote ${size} bytes to ${SHOT}`)

if (startedHere && !args.keep) {
  await cleanup()
} else if (startedHere) {
  console.error(`[run] --keep set; leaving server running (PID ${serverProc.pid})`)
}

// ── helpers ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--keep') out.keep = true
    else if (a === '--route') out.route = argv[++i]
    else if (a === '--out') out.out = argv[++i]
    else if (a === '--width') out.width = Number(argv[++i])
    else if (a === '--height') out.height = Number(argv[++i])
    else fail(`unknown arg: ${a}`)
  }
  return out
}

function portInUse(port) {
  return new Promise((res) => {
    const req = request({ host: 'localhost', port, path: '/', method: 'HEAD', timeout: 500 }, () => res(true))
    req.on('error', () => res(false))
    req.on('timeout', () => { req.destroy(); res(false) })
    req.end()
  })
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((res) => {
        const r = request(url, { method: 'GET', timeout: 1500 }, (resp) => {
          // Drain so the socket can close.
          resp.resume()
          res(resp.statusCode >= 200 && resp.statusCode < 400)
        })
        r.on('error', () => res(false))
        r.on('timeout', () => { r.destroy(); res(false) })
        r.end()
      })
      if (ok) return
    } catch { /* keep polling */ }
    await wait(300)
  }
  fail(`Server did not respond at ${url} within ${timeoutMs}ms`)
}

async function cleanup() {
  if (serverProc && !serverProc.killed) {
    console.error(`[run] stopping dev server (PID ${serverProc.pid})`)
    serverProc.kill('SIGTERM')
    // Give it a moment to exit gracefully.
    await wait(400)
    if (!serverProc.killed) serverProc.kill('SIGKILL')
  }
}

function fail(msg) {
  console.error(`[run] FAIL: ${msg}`)
  cleanup().finally(() => process.exit(1))
}
