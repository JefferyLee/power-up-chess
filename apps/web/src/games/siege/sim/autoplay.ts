// A greedy bot for balance checks. Every shopping pass it rates each
// possible buy — a new piece on a free cell, an upgrade, a branch, a pawn
// promotion, or the king beside pieces it already has — by (path cells
// covered × damage per second) per gold, takes the best one it can
// afford, and saves when something it cannot afford yet is clearly better
// (a rook that looks down a straight road beats three pawns). Starts
// waves early, keeps shopping mid-wave, never casts spells, never mazes,
// never sells. If it wins a map comfortably, Ada probably can too.
import type { Cell, MapDef, TowerLevel, TowerState, TowerStats, TowerType, WaveDef } from './types'
import { TOWER_DEFS, towerStats } from './defs'
import { createSim } from './sim'
import { parseMap, index } from './path'

export interface AutoplayOptions {
  /** Endless: stop (as a win) once this many waves are cleared. */
  endlessWaves?: number
  waveGenerator?: (wave: number) => WaveDef
}

export interface AutoplayResult {
  won: boolean
  wave: number
  lives: number
  score: number
  stars: number
  ticks: number
}

interface Buy {
  /** Extra (covered cells × dps) this buy adds to the board. */
  value: number
  cost: number
  run: () => boolean
}

const MAX_TICKS = 60_000
const TICK_DT = 1 / 20
const EARLY_WAVES = 2
const EARLY_TYPES: TowerType[] = ['pawn', 'knight']
const ALL_TYPES: TowerType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']
const WAVE_SHOP_EVERY = 2
/** Save for an unaffordable buy only when it beats the best affordable
 *  one by this much per gold; otherwise buy what we can, like a child would. */
const SAVE_RATIO = 1.25

/** Armour-piercing hits count for this much more: rooks (0.5 armour) and
 *  shielded maps halve everything else, and the Siege rook is the designed
 *  answer to them. */
const PIERCE_WORTH = 1.5

const dps = (s: TowerStats): number => s.damage * s.fireRate * (s.pierce ? PIERCE_WORTH : 1)
const auraMult = (s: TowerStats): number => (s.aura ? s.aura.damageMult * s.aura.rateMult : 1)

export function runAutoplay(map: MapDef, seed: number, opts: AutoplayOptions = {}): AutoplayResult {
  const endless = opts.waveGenerator !== undefined
  const sim = createSim({ map, seed, unlockedSpells: [], endless, waveGenerator: opts.waveGenerator })
  sim.setSpeed(2)
  const grid = parseMap(map)
  const buildable = grid.kinds
    .map((k, i) => (k === 'plot' || k === 'open' ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => ({ c: i % grid.cols, r: Math.floor(i / grid.cols) }))

  function pathSet(): Set<number> {
    const set = new Set<number>()
    for (const path of sim.state.paths) for (const c of path) set.add(index(grid, c))
    return set
  }

  function coverage(type: TowerType, cell: Cell, level: TowerLevel, branch: string | null, paths: Set<number>): number {
    let n = 0
    for (const c of sim.attackCells(type, cell, level, branch)) if (paths.has(index(grid, c))) n++
    return n
  }

  /** Covered cells × dps of a tower as it stands (0 for the king). */
  function power(t: TowerState, paths: Set<number>): number {
    const def = TOWER_DEFS[t.type]
    return coverage(t.type, t.cell, t.level, t.branch, paths) * dps(towerStats(def, t.level, t.branch))
  }

  /** Sum of `power` over the towers a king at `cell` would buff. */
  function neighbourPower(cell: Cell, paths: Set<number>): number {
    let sum = 0
    for (const c of sim.attackCells('king', cell, 1, null)) {
      const t = sim.towerAt(c)
      if (t && t.type !== 'king') sum += power(t, paths)
    }
    return sum
  }

  function newTowerBuys(paths: Set<number>, out: Buy[]): void {
    const s = sim.state
    const types = s.wave < EARLY_WAVES ? EARLY_TYPES : ALL_TYPES
    for (const cell of buildable) {
      // Building on the path itself reroutes it away from this very tower,
      // so the coverage estimate would be a lie.
      if (sim.towerAt(cell) || paths.has(index(grid, cell))) continue
      for (const type of types) {
        const def = TOWER_DEFS[type]
        const n = coverage(type, cell, 1, null, paths)
        if (n === 0) continue
        const can = sim.canBuild(cell, type)
        if (!can.ok && can.reason !== 'not enough gold') continue
        out.push({ value: n * dps(def.levels[0]), cost: def.cost, run: () => sim.build(cell, type) })
      }
      if (!s.towers.some((t) => t.type === 'king')) {
        const can = sim.canBuild(cell, 'king')
        if (!can.ok && can.reason !== 'not enough gold') continue
        const gain = (auraMult(TOWER_DEFS.king.levels[0]) - 1) * neighbourPower(cell, paths)
        if (gain > 0) out.push({ value: gain, cost: TOWER_DEFS.king.cost, run: () => sim.build(cell, 'king') })
      }
    }
  }

  function upgradeBuys(paths: Set<number>, out: Buy[]): void {
    for (const t of sim.state.towers) {
      const def = TOWER_DEFS[t.type]
      if (t.type === 'king') {
        // The aura's gain is its multiplier's growth over everything it buffs.
        const covered = neighbourPower(t.cell, paths)
        const now = auraMult(towerStats(def, t.level, t.branch))
        if (t.level === 1) {
          out.push({ value: (auraMult(def.levels[1]) - now) * covered, cost: def.upgradeCost, run: () => sim.upgrade(t.id) })
        } else if (t.level === 2) {
          for (const b of def.branches) {
            out.push({ value: (auraMult(b.stats) - now) * covered, cost: b.cost, run: () => sim.chooseBranch(t.id, b.id) })
          }
        }
        continue
      }
      const now = power(t, paths)
      if (t.type === 'pawn') {
        // Promotion: the pawn becomes a level-1 piece for cost(piece) − 40.
        for (const to of ALL_TYPES) {
          if (to === 'pawn') continue
          const can = sim.canPromote(t.id, to)
          if (!can.ok && can.reason !== 'not enough gold') continue
          const next = coverage(to, t.cell, 1, null, paths) * dps(TOWER_DEFS[to].levels[0])
          out.push({ value: next - now, cost: can.cost, run: () => sim.promote(t.id, to) })
        }
      }
      if (t.level === 1) {
        const next = coverage(t.type, t.cell, 2, null, paths) * dps(def.levels[1])
        out.push({ value: next - now, cost: def.upgradeCost, run: () => sim.upgrade(t.id) })
      } else if (t.level === 2) {
        for (const b of def.branches) {
          const next = coverage(t.type, t.cell, 3, b.id, paths) * dps(b.stats)
          out.push({ value: next - now, cost: b.cost, run: () => sim.chooseBranch(t.id, b.id) })
        }
      }
    }
  }

  /** One pass: the best buy per gold we can afford — or nothing (save)
   *  when something we cannot afford yet is clearly better. */
  function shopOnce(): boolean {
    const paths = pathSet()
    const buys: Buy[] = []
    newTowerBuys(paths, buys)
    upgradeBuys(paths, buys)
    const ratio = (b: Buy): number => b.value / b.cost
    let best: Buy | null = null
    let affordable: Buy | null = null
    for (const b of buys) {
      if (b.value <= 0) continue
      if (!best || ratio(b) > ratio(best)) best = b
      if (b.cost <= sim.state.gold && (!affordable || ratio(b) > ratio(affordable))) affordable = b
    }
    if (!affordable) return false
    if (best && best !== affordable && ratio(best) >= SAVE_RATIO * ratio(affordable)) return false
    return affordable.run()
  }

  function shop(): void {
    while (shopOnce()) {
      /* keep buying while the best buy is affordable */
    }
  }

  let ticks = 0
  let stars = 0
  let reached = false
  let nextShop = 0
  while (ticks < MAX_TICKS) {
    const s = sim.state
    if (s.phase === 'won' || s.phase === 'lost') break
    if (s.phase === 'build') {
      if (endless && opts.endlessWaves !== undefined && s.wave >= opts.endlessWaves) {
        reached = true
        break
      }
      shop()
      sim.startWave()
    } else if (s.time >= nextShop) {
      nextShop = s.time + WAVE_SHOP_EVERY
      shop()
    }
    if (s.bossIntro < 1) sim.skipIntro()
    for (const ev of sim.tick(TICK_DT)) if (ev.kind === 'won') stars = ev.stars
    ticks++
  }
  const s = sim.state
  return { won: s.phase === 'won' || reached, wave: s.wave, lives: s.lives, score: s.score, stars, ticks }
}
