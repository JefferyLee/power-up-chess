// Map parsing + BFS flow field. Enemies follow `next` from whatever cell
// they stand on to the goal, so a maze change reroutes them for free; the
// block rule refuses a tower that would strand any gate.
import type { Cell, CellKind, MapDef } from './types'

export interface Grid {
  cols: number
  rows: number
  /** Row-major: kinds[r * cols + c]. */
  kinds: CellKind[]
  /** Spawn gates in reading order. */
  gates: Cell[]
  goal: Cell
}

export interface FlowField {
  /** Cells to the goal; -1 when unreachable or not walkable. */
  dist: number[]
  /** Index of the next cell toward the goal; -1 at the goal / unreachable. */
  next: number[]
}

export type Dir = readonly [dc: number, dr: number]

/** Up, right, down, left — the BFS neighbour order (ties resolve this way). */
export const DIRS4: readonly Dir[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

const CHAR_KIND: Record<string, CellKind | undefined> = {
  '#': 'wall',
  '.': 'road',
  p: 'plot',
  o: 'open',
  S: 'road',
  G: 'road',
}

export function parseMap(map: MapDef): Grid {
  if (map.cells.length !== map.rows) {
    throw new Error(`map ${map.id}: expected ${map.rows} rows, got ${map.cells.length}`)
  }
  const kinds: CellKind[] = []
  const gates: Cell[] = []
  let goal: Cell | null = null
  for (let r = 0; r < map.rows; r++) {
    const row = map.cells[r] ?? ''
    if (row.length !== map.cols) {
      throw new Error(`map ${map.id}: row ${r} has ${row.length} cells, expected ${map.cols}`)
    }
    for (let c = 0; c < map.cols; c++) {
      const ch = row[c] ?? '#'
      const kind = CHAR_KIND[ch]
      if (!kind) throw new Error(`map ${map.id}: unknown cell '${ch}' at ${c},${r}`)
      kinds.push(kind)
      if (ch === 'S') gates.push({ c, r })
      if (ch === 'G') {
        if (goal) throw new Error(`map ${map.id}: more than one goal`)
        goal = { c, r }
      }
    }
  }
  if (!goal) throw new Error(`map ${map.id}: no goal`)
  if (gates.length === 0) throw new Error(`map ${map.id}: no spawn gate`)
  return { cols: map.cols, rows: map.rows, kinds, gates, goal }
}

export function inBounds(grid: Grid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows
}

export function index(grid: Grid, cell: Cell): number {
  return cell.r * grid.cols + cell.c
}

export function toCell(grid: Grid, i: number): Cell {
  return { c: i % grid.cols, r: Math.floor(i / grid.cols) }
}

export function kindAt(grid: Grid, cell: Cell): CellKind | null {
  if (!inBounds(grid, cell.c, cell.r)) return null
  return grid.kinds[index(grid, cell)] ?? null
}

/** `blocked` holds the indices of open cells that carry a tower. */
export function walkable(grid: Grid, blocked: ReadonlySet<number>, i: number): boolean {
  const k = grid.kinds[i]
  return k === 'road' || (k === 'open' && !blocked.has(i))
}

export function computeField(grid: Grid, blocked: ReadonlySet<number>): FlowField {
  const n = grid.cols * grid.rows
  const dist = new Array<number>(n).fill(-1)
  const next = new Array<number>(n).fill(-1)
  const goal = index(grid, grid.goal)
  dist[goal] = 0
  const queue = [goal]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    if (i === undefined) break
    const c = i % grid.cols
    const r = Math.floor(i / grid.cols)
    const d = dist[i] ?? 0
    for (const [dc, dr] of DIRS4) {
      const nc = c + dc
      const nr = r + dr
      if (!inBounds(grid, nc, nr)) continue
      const j = nr * grid.cols + nc
      if (dist[j] !== -1 || !walkable(grid, blocked, j)) continue
      dist[j] = d + 1
      next[j] = i
      queue.push(j)
    }
  }
  return { dist, next }
}

/** Cells from `from` to the goal inclusive; empty when unreachable. */
export function extractPath(grid: Grid, field: FlowField, from: Cell): Cell[] {
  const path: Cell[] = []
  let i = index(grid, from)
  if ((field.dist[i] ?? -1) < 0) return path
  while (i >= 0) {
    path.push(toCell(grid, i))
    i = field.next[i] ?? -1
  }
  return path
}

export function allGatesReach(grid: Grid, field: FlowField): boolean {
  return grid.gates.every((g) => (field.dist[index(grid, g)] ?? -1) >= 0)
}

/** The block rule: would a tower on `cell` cut some gate off from the goal? */
export function wouldBlock(grid: Grid, blocked: ReadonlySet<number>, cell: Cell): boolean {
  const trial = new Set(blocked)
  trial.add(index(grid, cell))
  return !allGatesReach(grid, computeField(grid, trial))
}
