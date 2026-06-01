// Stage 2 — stream-decompress the CSV via piped `zstd -d` and keep only
// the Ada-band candidates. Output: one JSON entry per line (jsonl).

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { Chess } from 'chess.js'
import { FILTERED_JSONL, RAW_ZST, WORK_DIR } from './paths.js'
import type { FilteredEntry } from './types.js'

// Ada-band: ~300-500 player should attempt 600-1100 rated puzzles.
const RATING_MIN = 600
const RATING_MAX = 1100
const POPULARITY_MIN = 80
const MAX_MOVES = 5       // 1 setup + up to 4 solver plies (covers fork/skewer follow-ups)

// Themes we want (Lichess vocabulary). Each filtered puzzle must include
// at least one. The first match (in this priority order) becomes its
// primary motif for stratified sampling. We put the rarer motifs first so
// a fork-and-mate puzzle lands in the fork bucket — mateIn1 is so common
// in this rating band that it would otherwise drown out the variety.
const TARGET_MOTIFS = [
  'skewer',
  'fork',
  'pin',
  'hangingPiece',
  'backRankMate',
  'mateIn2',
  'mateIn1',
]

export async function runFilter(): Promise<void> {
  await mkdir(WORK_DIR, { recursive: true })
  console.log(`Streaming ${RAW_ZST} through zstd -d → ${FILTERED_JSONL}`)

  const proc = spawn('zstd', ['-d', '-c', RAW_ZST], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  const out = createWriteStream(FILTERED_JSONL)
  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity })

  let totalRows = 0
  let header = true
  let kept = 0

  for await (const line of rl) {
    if (header) {
      header = false
      continue
    }
    totalRows++
    if (totalRows % 250_000 === 0) {
      process.stdout.write(`  scanned ${totalRows.toLocaleString()} rows, kept ${kept}\r`)
    }
    const entry = parseAndFilter(line)
    if (entry) {
      out.write(JSON.stringify(entry) + '\n')
      kept++
    }
  }

  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve())
    out.on('error', reject)
  })
  console.log(`\nScanned ${totalRows.toLocaleString()} rows. Kept ${kept.toLocaleString()}.`)
}

function parseAndFilter(line: string): FilteredEntry | null {
  const cols = parseCsvLine(line)
  if (cols.length < 8) return null
  const [puzzleId, fen, movesStr, ratingStr, , popularityStr, , themesStr] = cols
  if (!puzzleId || !fen || !movesStr || !ratingStr) return null

  const rating = Number(ratingStr)
  const popularity = Number(popularityStr)
  if (!Number.isFinite(rating) || !Number.isFinite(popularity)) return null
  if (rating < RATING_MIN || rating > RATING_MAX) return null
  if (popularity < POPULARITY_MIN) return null

  const moves = movesStr.split(' ').filter(Boolean)
  if (moves.length < 1 || moves.length > MAX_MOVES) return null

  const themes = (themesStr ?? '').split(' ').filter(Boolean)
  const primaryMotif = TARGET_MOTIFS.find((m) => themes.includes(m))
  if (!primaryMotif) return null

  // Apply the opponent's setup move to produce the puzzle's starting position
  // and confirm the rest of the moves are legal. Reject any row that fails
  // (Lichess data is clean enough that this is rare but it costs us nothing).
  const chess = new Chess(fen)
  const setup = moves[0]!
  const setupApplied = applyUci(chess, setup)
  if (!setupApplied) return null
  for (let i = 1; i < moves.length; i++) {
    if (!applyUci(chess, moves[i]!)) return null
  }

  // Reset to compute the post-setup FEN cleanly.
  const fresh = new Chess(fen)
  applyUci(fresh, setup)
  const fenAfterSetup = fresh.fen()
  const sideToMove: 'w' | 'b' = fenAfterSetup.split(' ')[1] === 'b' ? 'b' : 'w'

  return {
    puzzleId,
    fenAfterSetup,
    sideToMove,
    solution: moves.slice(1),
    themes,
    rating,
    popularity,
    primaryMotif,
  }
}

function applyUci(chess: Chess, uci: string): boolean {
  if (uci.length !== 4 && uci.length !== 5) return false
  try {
    const m = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
    })
    return m !== null
  } catch {
    return false
  }
}

// Minimal CSV parser — Lichess's dump uses no quoted fields, so a plain
// split is correct and much faster than pulling in csv-parse.
function parseCsvLine(line: string): string[] {
  return line.split(',')
}
