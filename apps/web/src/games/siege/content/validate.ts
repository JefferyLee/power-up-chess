// Static checks on content (used by content.test.ts). Self-contained: a
// tiny 4-neighbour BFS here, no import from sim/ beyond the types.
import type { BossId, Cell, EnemyType, MapDef } from '../sim/types'

export const ENEMY_TYPES: readonly EnemyType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']
export const BOSS_IDS: readonly BossId[] = ['blackKnight', 'ironRook', 'frostBishop', 'shadowQueen', 'darkKing']

const LEGEND = new Set(['#', '.', 'p', 'o', 'S', 'G'])
const WALKABLE = new Set(['.', 'o', 'S', 'G'])
const BUILDABLE = new Set(['p', 'o'])

export interface ParsedMap {
  /** Spawn gates in reading order. */
  gates: Cell[]
  goals: Cell[]
  /** Fraction of all cells that are buildable ('p' or 'o'). */
  buildable: number
  rectangular: boolean
  unknownChars: string[]
}

export function parseMap(map: MapDef): ParsedMap {
  const gates: Cell[] = []
  const goals: Cell[] = []
  const unknown = new Set<string>()
  let buildable = 0
  let rectangular = map.cells.length === map.rows
  map.cells.forEach((row, r) => {
    if (row.length !== map.cols) rectangular = false
    for (let c = 0; c < row.length; c++) {
      const ch = row[c] ?? ''
      if (!LEGEND.has(ch)) unknown.add(ch)
      if (ch === 'S') gates.push({ c, r })
      if (ch === 'G') goals.push({ c, r })
      if (BUILDABLE.has(ch)) buildable++
    }
  })
  return { gates, goals, buildable: buildable / (map.cols * map.rows), rectangular, unknownChars: [...unknown] }
}

/** True when `from` reaches a 'G' cell over walkable cells (4-neighbour BFS). */
export function reachesGoal(map: MapDef, from: Cell): boolean {
  const at = (c: number, r: number): string => map.cells[r]?.[c] ?? '#'
  const seen = new Set<number>([from.r * map.cols + from.c])
  const queue: Cell[] = [from]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    if (!cur) break
    if (at(cur.c, cur.r) === 'G') return true
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const c = cur.c + dc
      const r = cur.r + dr
      const key = r * map.cols + c
      if (c < 0 || r < 0 || c >= map.cols || r >= map.rows || seen.has(key)) continue
      if (!WALKABLE.has(at(c, r))) continue
      seen.add(key)
      queue.push({ c, r })
    }
  }
  return false
}

/** Every problem with a map's grid and waves; [] when it is sound. */
export function validateMap(map: MapDef): string[] {
  const problems: string[] = []
  const p = parseMap(map)
  if (!p.rectangular) problems.push(`grid is not ${map.cols}×${map.rows}`)
  if (p.unknownChars.length) problems.push(`unknown cell chars: ${p.unknownChars.join(' ')}`)
  if (p.goals.length !== 1) problems.push(`expected exactly one G, found ${p.goals.length}`)
  if (p.gates.length < 1) problems.push('no spawn gate (S)')
  p.gates.forEach((gate, i) => {
    if (!reachesGoal(map, gate)) problems.push(`gate ${i} at (${gate.c},${gate.r}) cannot reach G`)
  })
  if (p.buildable < 0.25) problems.push(`only ${(p.buildable * 100).toFixed(1)} % of cells are buildable`)
  if (map.waves.length === 0) problems.push('no waves')
  let lastMult = 0
  map.waves.forEach((wave, i) => {
    const mult = wave.hpMult ?? 1
    if (mult < lastMult) problems.push(`wave ${i + 1}: hpMult ${mult} < previous ${lastMult}`)
    lastMult = mult
    if (wave.groups.length === 0) problems.push(`wave ${i + 1}: no groups`)
    if (wave.boss !== undefined && !BOSS_IDS.includes(wave.boss)) problems.push(`wave ${i + 1}: unknown boss ${wave.boss}`)
    wave.groups.forEach((grp, j) => {
      const tag = `wave ${i + 1} group ${j + 1}`
      if (!ENEMY_TYPES.includes(grp.type)) problems.push(`${tag}: unknown enemy ${grp.type}`)
      if (!(grp.count >= 1)) problems.push(`${tag}: count ${grp.count}`)
      if (!(grp.gap > 0)) problems.push(`${tag}: gap ${grp.gap}`)
      if (!(grp.delay >= 0)) problems.push(`${tag}: delay ${grp.delay}`)
      if (grp.gate !== undefined && (grp.gate < 0 || grp.gate >= p.gates.length)) problems.push(`${tag}: gate ${grp.gate} of ${p.gates.length}`)
    })
  })
  return problems
}
