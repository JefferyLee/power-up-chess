// Tiny inline maps + helpers for the sim tests (content/ is built elsewhere).
import type { EnemyState, MapDef, Sim, SimEvent, SpellId, WaveDef, WaveGroup } from './types'
import { createSim } from './sim'

/** 8×5: one straight road on row 2 from the gate (0,2) to the goal (7,2). */
export const LANE = [
  '########',
  'pppppppp',
  'S......G',
  'pppppppp',
  '########',
]

/** 20×3: a long lane for boss timing tests. */
export const LONG = [
  'pppppppppppppppppppp',
  'S..................G',
  'pppppppppppppppppppp',
]

/** 7×5 open field: gate (0,1), goal (6,3); every 'o' is walkable + buildable. */
export const OPEN = [
  '#######',
  'Sooooo#',
  '#ooooo#',
  '#oooooG',
  '#######',
]

/** 6×3: the road runs left→right along row 0 then turns down; a plot at
 *  (5,0) looks straight back along the road (line-blocking tests). */
export const END = [
  'S....p',
  '####.#',
  '####G#',
]

export function mapOf(cells: string[], extra: Partial<MapDef> = {}): MapDef {
  return {
    id: 'test',
    order: 0,
    name: 'Test',
    subtitle: '',
    theme: 'courtyard',
    cols: cells[0]?.length ?? 0,
    rows: cells.length,
    cells,
    waves: [],
    modifiers: [],
    startGold: 500,
    lives: 20,
    intro: '',
    ...extra,
  }
}

export function group(type: WaveGroup['type'], count: number, gap = 0, delay = 0, gate?: number): WaveGroup {
  return gate === undefined ? { type, count, gap, delay } : { type, count, gap, delay, gate }
}

export function wave(groups: WaveGroup[], extra: Partial<WaveDef> = {}): WaveDef {
  return { groups, ...extra }
}

export function simOf(cells: string[], extra: Partial<MapDef> = {}, unlocked: SpellId[] = []): Sim {
  return createSim({ map: mapOf(cells, extra), seed: 1, unlockedSpells: unlocked })
}

/** Ticks `seconds` of wall time in 1/20 s slices and returns every event. */
export function run(sim: Sim, seconds: number, dt = 1 / 20): SimEvent[] {
  const out: SimEvent[] = []
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(...sim.tick(dt))
  return out
}

/** Starts wave 1 and runs one 60 Hz step so delay-0 groups spawn. */
export function spawnNow(sim: Sim): SimEvent[] {
  sim.startWave()
  return sim.tick(1 / 60)
}

/** Parks an enemy on a cell centre and freezes it there. */
export function park(e: EnemyState, c: number, r: number, progress = e.progress): void {
  e.pos.x = c + 0.5
  e.pos.y = r + 0.5
  e.progress = progress
  e.frozenUntil = 1e9
}

export function ofKind<K extends SimEvent['kind']>(events: SimEvent[], kind: K): Extract<SimEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind)
}
