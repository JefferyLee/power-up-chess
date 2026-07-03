// Batch-generate CANDIDATE puzzle explanations for human review (pipeline
// Stage 5-6). Reuses the deployed `explainPuzzle` Cloud Function so candidates
// match the live host voice exactly — no separate LLM key needed. Output is a
// review file; a human approves the keepers before they go near the app.
//
// Usage (from repo root):
//   node tools/puzzle-explain/generate.mjs [--max-diff 550] [--limit 40] [--host lucy]
//
// Reads the Firebase web config from apps/web/.env.local, signs in
// anonymously, and calls the callable for the N easiest puzzles under the
// difficulty cap. Respects the function's 120/day quota — keep --limit modest.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const require = createRequire(resolve(repoRoot, 'apps/web/package.json'))
const { Chess } = require('chess.js')

function arg(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : def
}
const MAX_DIFF = Number(arg('max-diff', 550))
const LIMIT = Number(arg('limit', 40))
const HOST = arg('host', 'lucy')

// --- Firebase web config from apps/web/.env.local ---
const env = readFileSync(resolve(repoRoot, 'apps/web/.env.local'), 'utf8')
const readEnv = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'))
  if (!m) throw new Error('missing ' + k + ' in apps/web/.env.local')
  return m[1].trim()
}
const API_KEY = readEnv('VITE_FIREBASE_API_KEY')
const PROJECT_ID = readEnv('VITE_FIREBASE_PROJECT_ID')
const CALLABLE = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/explainPuzzle`

function uciToSan(fen, uci) {
  try {
    const c = new Chess(fen)
    const out = []
    for (const u of uci.slice(0, 6)) {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4, 5) || undefined })
      if (!m) break
      out.push(m.san)
    }
    return out
  } catch { return [] }
}

async function anonToken() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    // The browser key is referrer-restricted (Phase 1.8) — identify as the app.
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://power-up-chess-dev.web.app/' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  const data = await res.json()
  if (!data.idToken) throw new Error('anon sign-in failed: ' + JSON.stringify(data).slice(0, 200))
  return data.idToken
}

async function explain(token, host, fen, solutionSan, motifs) {
  const res = await fetch(CALLABLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ data: { host, fen, solutionSan, motifs } }),
  })
  const data = await res.json()
  if (data.error) throw new Error(JSON.stringify(data.error).slice(0, 200))
  return data.result
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const all = require(resolve(repoRoot, 'data/puzzles/lichess.json'))
  const arr = Array.isArray(all) ? all : all.puzzles
  const batch = arr
    .filter((p) => p.difficulty <= MAX_DIFF)
    .sort((a, b) => a.difficulty - b.difficulty)
    .slice(0, LIMIT)

  console.error(`[gen] ${batch.length} puzzles (≤${MAX_DIFF} difficulty), host=${HOST}`)
  const token = await anonToken()

  const out = []
  for (let i = 0; i < batch.length; i++) {
    const p = batch[i]
    const san = uciToSan(p.fen, p.solution)
    if (san.length === 0) { console.error(`  skip ${p.id} (no SAN)`); continue }
    try {
      const r = await explain(token, HOST, p.fen, san, p.motifs)
      out.push({
        id: p.id, difficulty: p.difficulty, motifs: p.motifs,
        fen: p.fen, san, host: HOST,
        candidate: r.text, source: r.source, rightsStatus: 'needs_review',
      })
      console.error(`  [${i + 1}/${batch.length}] ${p.id} (${p.difficulty}) ✓`)
    } catch (e) {
      console.error(`  [${i + 1}/${batch.length}] ${p.id} FAILED: ${e.message}`)
    }
    await sleep(400)
  }

  const outDir = resolve(repoRoot, 'data/puzzles')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'explanations-review.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.error(`\n[gen] wrote ${out.length} candidates → ${outPath}`)
  console.error('[gen] Review, edit the `candidate` text, keep the good ones, then merge into the puzzles (Firestore explanation field).')
}

main().catch((e) => { console.error('[gen] failed:', e.message); process.exit(1) })
