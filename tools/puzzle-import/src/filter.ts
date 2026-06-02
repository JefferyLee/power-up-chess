// Stage 2 — stream-decompress the CSV via piped `zstd -d` and keep only
// rows that fit the Puzzle Garden's full rating range (400-3000, plus a
// separate 3000+ pool for the Legends Hall). Output: one JSON entry per
// line (jsonl).

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { Chess } from 'chess.js'
import { FILTERED_JSONL, RAW_ZST, WORK_DIR } from './paths.js'
import type { FilteredEntry, Plot } from './types.js'

const RATING_MIN = 400
const RATING_MAX_LEGENDS = 3500          // anything 3000+ goes into the Legends pool
const POPULARITY_MIN_BASE = 80           // low-rating puzzles get many plays — keep the bar high
const POPULARITY_MIN_HIGH = 30           // 2000+ puzzles have far fewer plays; relax

// Cap moves by rating tier — beginners get short, focused puzzles;
// higher tiers can run longer.
function maxMovesFor(rating: number): number {
  if (rating < 1100) return 5    // 1 setup + up to 4 plies
  if (rating < 1900) return 9    // up to 8 plies
  return 15                      // master-tier combos can be long
}

// Plot membership — every theme we care about maps to exactly one plot.
// Order within each plot is purely documentation.
const PLOT_THEMES: Record<Plot, readonly string[]> = {
  fork: ['fork'],
  pinSkewer: ['pin', 'skewer'],
  sacrifice: [
    'sacrifice',
    'discoveredAttack',
    'doubleCheck',
    'attraction',
    'deflection',
    'clearance',
    'interference',
  ],
  endgame: [
    'endgame',
    'pawnEndgame',
    'rookEndgame',
    'queenEndgame',
    'bishopEndgame',
    'knightEndgame',
    'queenRookEndgame',
  ],
  mate: [
    'mate',
    'mateIn1',
    'mateIn2',
    'mateIn3',
    'mateIn4',
    'mateIn5',
    'backRankMate',
    'smotheredMate',
    'anastasiaMate',
    'arabianMate',
    'bodenMate',
    'hookMate',
    'doubleBishopMate',
  ],
  defense: ['defensiveMove', 'quietMove', 'hangingPiece'],
}

// Priority order when a puzzle qualifies for multiple plots — favour the
// more distinctive plot so "fork that also mates" lands in fork (which is
// what the solver is actually looking for), and the very common `mate`
// catches the rest.
const PLOT_PRIORITY: Plot[] = ['fork', 'pinSkewer', 'sacrifice', 'endgame', 'mate', 'defense']

// Which theme inside the chosen plot becomes the displayed `primaryMotif`.
// Rarer / more specific themes come first so a `backRankMate` shows that
// label rather than the generic `mate`.
const MOTIF_PRIORITY: readonly string[] = [
  'fork',
  'skewer',
  'pin',
  'discoveredAttack',
  'doubleCheck',
  'sacrifice',
  'attraction',
  'deflection',
  'clearance',
  'interference',
  'backRankMate',
  'smotheredMate',
  'anastasiaMate',
  'arabianMate',
  'bodenMate',
  'hookMate',
  'doubleBishopMate',
  'mateIn1',
  'mateIn2',
  'mateIn3',
  'mateIn4',
  'mateIn5',
  'mate',
  'pawnEndgame',
  'rookEndgame',
  'queenEndgame',
  'bishopEndgame',
  'knightEndgame',
  'queenRookEndgame',
  'endgame',
  'defensiveMove',
  'quietMove',
  'hangingPiece',
]

const ALL_TARGET_THEMES = new Set<string>(
  Object.values(PLOT_THEMES).flatMap((arr) => arr as string[]),
)

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
  const plotCounts: Record<Plot, number> = {
    mate: 0, fork: 0, pinSkewer: 0, sacrifice: 0, endgame: 0, defense: 0,
  }

  for await (const line of rl) {
    if (header) {
      header = false
      continue
    }
    totalRows++
    if (totalRows % 250_000 === 0) {
      process.stdout.write(`  scanned ${totalRows.toLocaleString()} rows, kept ${kept.toLocaleString()}\r`)
    }
    const entry = parseAndFilter(line)
    if (entry) {
      out.write(JSON.stringify(entry) + '\n')
      kept++
      plotCounts[entry.plot]++
    }
  }

  await new Promise<void>((resolve, reject) => {
    out.end(() => resolve())
    out.on('error', reject)
  })
  console.log(`\nScanned ${totalRows.toLocaleString()} rows. Kept ${kept.toLocaleString()}.`)
  console.log('  Plot breakdown:')
  for (const p of PLOT_PRIORITY) {
    console.log(`    ${p.padEnd(10)} ${plotCounts[p].toLocaleString()}`)
  }
}

function parseAndFilter(line: string): FilteredEntry | null {
  const cols = parseCsvLine(line)
  if (cols.length < 8) return null
  const [puzzleId, fen, movesStr, ratingStr, ratingDevStr, popularityStr, , themesStr] = cols
  if (!puzzleId || !fen || !movesStr || !ratingStr) return null

  const rating = Number(ratingStr)
  const ratingDeviation = Number(ratingDevStr)
  const popularity = Number(popularityStr)
  if (!Number.isFinite(rating) || !Number.isFinite(popularity)) return null
  if (rating < RATING_MIN || rating > RATING_MAX_LEGENDS) return null
  const popFloor = rating >= 2000 ? POPULARITY_MIN_HIGH : POPULARITY_MIN_BASE
  if (popularity < popFloor) return null

  const moves = movesStr.split(' ').filter(Boolean)
  if (moves.length < 1 || moves.length > maxMovesFor(rating)) return null

  const themes = (themesStr ?? '').split(' ').filter(Boolean)

  // Reject anything that doesn't touch one of our target themes.
  let touchesTarget = false
  for (const t of themes) {
    if (ALL_TARGET_THEMES.has(t)) { touchesTarget = true; break }
  }
  if (!touchesTarget) return null

  const plot = pickPlot(themes)
  if (!plot) return null
  const primaryMotif = pickPrimaryMotif(themes, plot) ?? plot

  // Apply the opponent's setup move to produce the puzzle's starting position
  // and confirm the rest of the moves are legal. Lichess data is clean
  // enough that this is rare but it costs us nothing.
  const chess = new Chess(fen)
  const setup = moves[0]!
  if (!applyUci(chess, setup)) return null
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
    ratingDeviation: Number.isFinite(ratingDeviation) ? ratingDeviation : 0,
    popularity,
    primaryMotif,
    plot,
  }
}

function pickPlot(themes: string[]): Plot | null {
  const themeSet = new Set(themes)
  for (const plot of PLOT_PRIORITY) {
    for (const t of PLOT_THEMES[plot]) {
      if (themeSet.has(t)) return plot
    }
  }
  return null
}

function pickPrimaryMotif(themes: string[], plot: Plot): string | null {
  const plotThemes = new Set(PLOT_THEMES[plot])
  for (const m of MOTIF_PRIORITY) {
    if (plotThemes.has(m) && themes.includes(m)) return m
  }
  return null
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
