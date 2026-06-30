// Master-game import pipeline.
//
// Reads PGN files from data/master-games/source/*.pgn (gitignored — see
// data/master-games/README.md), validates EVERY game through chess.js
// (illegal / unparseable / too-short / unfinished games are dropped),
// dedups, normalises the metadata, and emits a compact browseable index
// plus lazy-loadable PGN shards into apps/web/public/master-games/.
//
// Game scores are public-domain facts; we ship only factual metadata +
// the move text. No annotations are copied. The hand-curated classics
// (with original blurbs) are merged in from ./classics.js.
//
//   node tools/games-import/import.mjs
//
// Output:
//   apps/web/public/master-games/index.json   — { classics, games, shardSize }
//   apps/web/public/master-games/g/NNNN.json  — { id: movetext } per shard

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const SRC_DIR = path.join(REPO, 'data/master-games/source')
const OUT_DIR = path.join(REPO, 'apps/web/public/master-games')
const SHARD_SIZE = 400
const MIN_PLIES = 10
const MAX_PLIES = 220

// Keep only games where BOTH players are marquee names — turns the raw
// dump (every blitz/obscure game) into a famous-vs-famous "名局" archive
// and bounds the corpus to a few thousand. Surnames match the source
// filenames. Set MARQUEE to null to keep every game.
const MARQUEE = new Set([
  'carlsen', 'anand', 'kramnik', 'karpov', 'kasparov', 'fischer', 'tal',
  'capablanca', 'botvinnik', 'alekhine', 'lasker', 'spassky', 'petrosian',
  'morphy', 'caruana', 'nakamura', 'ding', 'nepomniachtchi', 'firouzja',
  'aronian', 'so', 'giri', 'vachier-lagrave', 'grischuk', 'mamedyarov',
  'rapport', 'gukesh',
])

/** Surname (lowercased) from a PGN name tag — "Kasparov, Garry" → kasparov. */
function surname(raw) {
  const n = (raw || '').trim()
  if (!n) return ''
  const comma = n.indexOf(',')
  const s = comma >= 0 ? n.slice(0, comma) : (n.split(/\s+/).pop() || '')
  return s.trim().toLowerCase()
}

// chess.js is a dep of apps/web (pnpm), not the repo root — resolve it
// from there so this script runs from anywhere.
const reqWeb = createRequire(path.join(REPO, 'apps/web/package.json'))
const { Chess } = await import(pathToFileURL(reqWeb.resolve('chess.js')).href)
const { CLASSICS } = await import(pathToFileURL(path.join(REPO, 'tools/games-import/classics.js')).href)

/** "Last, First" → "First Last"; leaves already-plain names alone. */
function tidyName(raw) {
  const n = (raw || '').trim()
  if (!n || n === '?') return 'Unknown'
  const comma = n.indexOf(',')
  if (comma === -1) return n
  const last = n.slice(0, comma).trim()
  const first = n.slice(comma + 1).trim()
  return first ? `${first} ${last}` : last
}

function yearOf(dateTag) {
  const m = /^(\d{4})/.exec((dateTag || '').trim())
  return m ? Number(m[1]) : 0
}

/** FNV-1a over the movetext — cheap dedup key. */
function hash(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Validate a PGN through chess.js and return clean SAN movetext +
 *  ply count, or null if it's illegal / too short / too long. */
function validate(pgn, result) {
  let chess
  try {
    chess = new Chess()
    chess.loadPgn(pgn)
  } catch {
    return null
  }
  const hist = chess.history()
  if (hist.length < MIN_PLIES || hist.length > MAX_PLIES) return null
  let mt = ''
  for (let i = 0; i < hist.length; i++) {
    if (i % 2 === 0) mt += `${i / 2 + 1}. `
    mt += hist[i] + ' '
  }
  return { movetext: (mt + result).trim(), plies: hist.length }
}

/** Split a PGN file into individual game blocks. */
function splitGames(text) {
  const norm = text.replace(/\r\n?/g, '\n')
  // A new game starts at an [Event tag that follows a blank line (or BOF).
  return norm.split(/\n\s*\n(?=\[Event )/).map((s) => s.trim()).filter(Boolean)
}

function tag(block, name) {
  const m = new RegExp(`\\[${name}\\s+"([^"]*)"\\]`).exec(block)
  return m ? m[1] : ''
}

// ── Build classics index (validated, pgn inline) ──
const classicsOut = []
for (const c of CLASSICS) {
  const v = validate(c.pgn, c.result)
  if (!v) {
    console.error(`✗ CLASSIC FAILED VALIDATION: ${c.id} ${c.white} vs ${c.black}`)
    process.exit(1)
  }
  classicsOut.push({
    id: c.id, white: c.white, black: c.black, event: c.event, year: c.year,
    result: c.result, eco: c.eco, plies: v.plies, hostId: c.hostId,
    blurb: c.blurb, pgn: v.movetext,
  })
}
console.log(`✓ ${classicsOut.length} classics validated`)

// ── Build master index from source PGNs ──
// Player names + event strings are interned into dictionaries and the
// per-game rows store integer indices — without this the repeated long
// strings blow the index past 6 MB. result is a 1-char code.
const RESULTS = new Map([['1-0', 0], ['0-1', 1], ['1/2-1/2', 2]])
const players = []
const playerIdx = new Map()
const events = []
const eventIdx = new Map()
const intern = (dict, map, s) => {
  let i = map.get(s)
  if (i === undefined) { i = dict.length; dict.push(s); map.set(s, i) }
  return i
}
const seen = new Set()
const games = []        // index rows: [id, wIdx, bIdx, evIdx, year, rCode, eco, plies]
const shards = new Map() // shardNo -> { id: movetext }
let counter = 0
let scanned = 0, dropped = 0

const files = existsSync(SRC_DIR)
  ? readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith('.pgn'))
  : []

for (const file of files) {
  const blocks = splitGames(readFileSync(path.join(SRC_DIR, file), 'utf8'))
  let kept = 0
  for (const block of blocks) {
    scanned++
    const result = tag(block, 'Result')
    if (!RESULTS.has(result)) { dropped++; continue }
    const rawWhite = tag(block, 'White')
    const rawBlack = tag(block, 'Black')
    if (MARQUEE && !(MARQUEE.has(surname(rawWhite)) && MARQUEE.has(surname(rawBlack)))) {
      dropped++; continue
    }
    const v = validate(block, result)
    if (!v) { dropped++; continue }
    const white = tidyName(rawWhite)
    const black = tidyName(rawBlack)
    const key = `${white}|${black}|${hash(v.movetext)}`
    if (seen.has(key)) { dropped++; continue }
    seen.add(key)

    const id = counter.toString(36)
    const shardNo = Math.floor(counter / SHARD_SIZE)
    if (!shards.has(shardNo)) shards.set(shardNo, {})
    shards.get(shardNo)[id] = v.movetext

    games.push([
      id,
      intern(players, playerIdx, white),
      intern(players, playerIdx, black),
      intern(events, eventIdx, tag(block, 'Event') || 'Unknown event'),
      yearOf(tag(block, 'Date')),
      RESULTS.get(result),
      tag(block, 'ECO') || '',
      v.plies,
    ])
    counter++
    kept++
  }
  console.log(`  ${file}: kept ${kept}/${blocks.length}`)
}

// ── Write output ──
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(path.join(OUT_DIR, 'g'), { recursive: true })

writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify({
  version: 2,
  shardSize: SHARD_SIZE,
  players,
  events,
  classics: classicsOut,
  games,
}))
for (const [shardNo, obj] of shards) {
  const name = String(shardNo).padStart(4, '0') + '.json'
  writeFileSync(path.join(OUT_DIR, 'g', name), JSON.stringify(obj))
}

const idxKB = Math.round(readFileSync(path.join(OUT_DIR, 'index.json')).length / 1024)
console.log(`\n✓ master games: kept ${games.length}, dropped ${dropped} of ${scanned} scanned`)
console.log(`✓ unique players: ${players.length}  ·  events: ${events.length}`)
console.log(`✓ shards: ${shards.size}  ·  index.json: ${idxKB} KB`)
console.log(`✓ output → apps/web/public/master-games/`)
