// world — React-free helpers shared by the Siege view: the cell→world
// mapping (map centred on the origin, one cell = one unit, +x = columns,
// +z = rows), piece lookups, gate positions, and the allocation-free
// state searches the frame loops run.
import type { PieceSymbol } from '../../../chess/types'
import { BOSS_DEFS, ENEMY_DEFS } from '../sim/defs'
import type { BossDef, BossId, Cell, EnemyDef, EnemyState, EnemyType, MapDef, SimState, TowerState, TowerType } from '../sim/types'

export function cellX(c: number, cols: number): number {
  return c + 0.5 - cols / 2
}
export function cellZ(r: number, rows: number): number {
  return r + 0.5 - rows / 2
}
/** Continuous sim position (cell units) → world. */
export function posX(x: number, cols: number): number {
  return x - cols / 2
}
export function posZ(y: number, rows: number): number {
  return y - rows / 2
}

export const PIECE_SYM: Record<TowerType, PieceSymbol> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }
const BOSS_SYM: Record<BossId, PieceSymbol> = { blackKnight: 'n', ironRook: 'r', frostBishop: 'b', shadowQueen: 'q', darkKing: 'k' }

export function isBossId(type: EnemyType | BossId): type is BossId {
  return type in BOSS_SYM
}
export function symbolFor(type: EnemyType | BossId): PieceSymbol {
  return isBossId(type) ? BOSS_SYM[type] : PIECE_SYM[type]
}

/** Top of each procedural piece (pieceGeometry.ts profiles, unscaled) —
 *  where crowns, stun rings and health bars sit. */
export const PIECE_TOP: Record<PieceSymbol, number> = { p: 0.57, n: 0.8, b: 0.8, r: 0.6, q: 0.92, k: 1.05 }

/** Camera pose that frames a cols × rows map from the default 40° fov,
 *  pulling back on narrow (portrait) viewports; clamped to the
 *  OrbitControls range 8–26. */
export function fitCamera(cols: number, rows: number, aspect = 1.6): [number, number, number] {
  const d = Math.max(8, Math.min(26, Math.max(cols * Math.max(1, 1.6 / aspect), rows * 1.6)))
  return [0, d * 0.78, d * 0.62]
}

export const TOWER_SCALE = 1.15
export const ENEMY_SCALE = 0.85
/** Board3D's wood-palette ivory, and a matching ebony for the black army. */
export const IVORY = '#efe3c4'
export const EBONY = '#26222a'
/** Board3D's legal-move green and selection gold. */
export const TINT_LEGAL = '#7cc28b'
export const TINT_SELECTED = '#f1c34c'

/** sim/defs.ts is being filled in alongside this view (and the mock sim
 *  has no defs at all), so these lookups fall back to something sane. */
export function bossDef(id: BossId): Pick<BossDef, 'name' | 'title' | 'intro' | 'scale'> {
  const d = BOSS_DEFS[id] as BossDef | undefined
  return d ?? { name: id.replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase()), title: '', intro: '', scale: 1.7 }
}
export function enemyScale(type: EnemyType | BossId): number {
  if (isBossId(type)) return bossDef(type).scale
  return (ENEMY_DEFS[type] as EnemyDef | undefined)?.scale ?? 1
}

export interface Gates {
  spawns: Cell[]
  goal: Cell
}
/** The map's 'S' / 'G' cells, spawns in reading order. */
export function findGates(map: MapDef): Gates {
  const spawns: Cell[] = []
  let goal: Cell = { c: 0, r: 0 }
  map.cells.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'S') spawns.push({ c, r })
      else if (row[c] === 'G') goal = { c, r }
    }
  })
  return { spawns, goal }
}

export function findTower(st: SimState, id: number): TowerState | null {
  for (const t of st.towers) if (t.id === id) return t
  return null
}
export function findEnemy(st: SimState, id: number): EnemyState | null {
  for (const e of st.enemies) if (e.id === id) return e
  return null
}
