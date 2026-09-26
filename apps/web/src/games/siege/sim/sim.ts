// The simulation: fixed 60 Hz sub-steps, seeded, pure TS. The view reads
// `state` every frame and animates the events + projectiles/beams; all
// damage is applied here the instant a shot is fired.
import type {
  Cell,
  CellKind,
  EnemyState,
  Modifier,
  Sim,
  SimEvent,
  SimOptions,
  SimState,
  SpellId,
  SpellTarget,
  Targeting,
  TowerLevel,
  TowerState,
  TowerStats,
  TowerType,
  WaveDef,
} from './types'
import { TOWER_DEFS, towerPattern, towerStats } from './defs'
import { mulberry32 } from './rng'
import { DIRS4, computeField, inBounds, index, kindAt, parseMap, toCell, walkable, wouldBlock } from './path'
import {
  CHAIN_RANGE,
  INTRO_SECONDS,
  PROJECTILE_SPEED,
  STEP,
  addBeam,
  addProjectile,
  alive,
  centre,
  cellOf,
  distance,
  enqueueSpawn,
  findTower,
  hitEnemy,
  isGone,
  isRush,
  leakEnemy,
  nextId,
  recomputeBuffs,
  recomputeField,
  refreshScore,
  sameCell,
  spawnEnemy,
  sweep,
  type Ctx,
  type EnemyRt,
} from './core'
import { dashSpeed, healAround, spawnBoss, stepBosses } from './bosses'
import { castSpell, initSpells, tickSpells } from './spells'

const MAX_DT = 0.25
const SELL_FRACTION = 0.6
const BUILD_COUNTDOWN = 12
const CLEAR_COUNTDOWN = 8
const RUSH_COUNTDOWN = 3
const EARLY_START_GOLD = 2
const BOSS_AFTER_LAST_GROUP = 1.5
const MAX_TOWERS = 8
const SPLASH_FRACTION = 0.5
const PROMOTE_DISCOUNT = 40

export function createSim(opts: SimOptions): Sim {
  const map = opts.map
  const mods = new Set<Modifier>([...map.modifiers, ...(opts.modifiers ?? [])])
  const grid = parseMap(map)
  const endless = opts.endless === true
  const waveGenerator = opts.waveGenerator
  if (endless && !waveGenerator) throw new Error('endless mode needs a waveGenerator')
  const rush = mods.has('rush')

  const state: SimState = {
    time: 0,
    speed: 1,
    paused: false,
    phase: 'build',
    gold: mods.has('lowBudget') ? 70 : map.startGold,
    lives: map.lives,
    livesMax: map.lives,
    wave: 0,
    waveTotal: endless ? 0 : map.waves.length,
    countdown: rush ? RUSH_COUNTDOWN : BUILD_COUNTDOWN,
    pending: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    beams: [],
    telegraphs: [],
    spells: initSpells(opts.unlockedSpells),
    score: 0,
    kills: 0,
    leaks: 0,
    paths: [],
    boss: null,
    bossIntro: 1,
    introBoss: null,
  }

  const ctx: Ctx = {
    state,
    map,
    mods,
    rng: mulberry32(opts.seed),
    grid,
    field: computeField(grid, new Set()),
    blocked: new Set(),
    events: [],
    ids: { next: 1 },
    enemyRt: new Map(),
    towerReady: new Map(),
    bossRt: new Map(),
    aura: null,
    queue: [],
    bossPending: null,
    waveHpMult: 1,
    wavesCleared: 0,
    rewards: 0,
    bonuses: 0,
    comboScore: 0,
    starBonus: 0,
    killTimes: [],
    pendingAbilities: [],
    acc: 0,
    dirty: false,
  }
  recomputeField(ctx)

  // ── Waves ──────────────────────────────────────────────────────────
  function waveDef(n: number): WaveDef {
    const def = endless && waveGenerator ? waveGenerator(n) : map.waves[n - 1]
    if (!def) throw new Error(`map ${map.id}: no wave ${n}`)
    return def
  }

  function beginWave(): void {
    state.wave++
    state.phase = 'wave'
    state.countdown = 0
    const def = waveDef(state.wave)
    ctx.waveHpMult = def.hpMult ?? 1
    let last = state.time
    for (const g of def.groups) {
      for (let i = 0; i < g.count; i++) {
        const at = state.time + g.delay + i * g.gap
        last = Math.max(last, at)
        enqueueSpawn(ctx, { at, type: g.type, gate: g.gate ?? 0, fromBoss: false })
      }
    }
    ctx.bossPending = def.boss ? { id: def.boss, at: last + BOSS_AFTER_LAST_GROUP } : null
    state.pending = ctx.queue.length + (ctx.bossPending ? 1 : 0)
    ctx.events.push({ kind: 'waveStart', wave: state.wave })
  }

  function processSpawns(): void {
    const t = state.time
    let head = ctx.queue[0]
    while (head && head.at <= t) {
      ctx.queue.shift()
      const gate = grid.gates[head.gate] ?? grid.gates[0]
      if (gate) spawnEnemy(ctx, head.type, centre(gate))
      head = ctx.queue[0]
    }
    const bp = ctx.bossPending
    if (bp && ctx.queue.length === 0 && t >= bp.at) {
      ctx.bossPending = null
      const gate = grid.gates[0]
      if (gate) spawnBoss(ctx, bp.id, centre(gate))
    }
    state.pending = ctx.queue.length + (ctx.bossPending ? 1 : 0)
  }

  function checkClear(): void {
    if (state.pending > 0 || state.enemies.length > 0) return
    ctx.wavesCleared++
    const bonus = 20 + 8 * state.wave
    state.gold += bonus
    ctx.bonuses += bonus
    ctx.events.push({ kind: 'waveClear', wave: state.wave, bonus })
    if (!endless && state.wave >= state.waveTotal) {
      const lost = state.livesMax - state.lives
      const stars = lost === 0 ? 3 : lost <= 3 ? 2 : 1
      ctx.starBonus = stars * 500
      state.phase = 'won'
      refreshScore(ctx)
      ctx.events.push({ kind: 'won', stars, score: state.score })
      return
    }
    state.phase = 'build'
    state.countdown = rush ? RUSH_COUNTDOWN : CLEAR_COUNTDOWN
    refreshScore(ctx)
  }

  // ── Enemies ────────────────────────────────────────────────────────
  function nextCell(cell: Cell): Cell | null {
    const i = index(grid, cell)
    const n = ctx.field.next[i] ?? -1
    if (n >= 0) return toCell(grid, n)
    // Standing on a blocked or dead cell (a tower just landed here): step
    // to the neighbour nearest the goal.
    let best = -1
    let bestD = Infinity
    for (const [dc, dr] of DIRS4) {
      const c = cell.c + dc
      const r = cell.r + dr
      if (!inBounds(grid, c, r)) continue
      const j = index(grid, { c, r })
      const d = ctx.field.dist[j] ?? -1
      if (d >= 0 && d < bestD && walkable(grid, ctx.blocked, j)) {
        best = j
        bestD = d
      }
    }
    return best >= 0 ? toCell(grid, best) : null
  }

  function moveEnemy(e: EnemyState, rt: EnemyRt, h: number): void {
    const t = state.time
    if (t >= e.slowUntil) e.speedMult = 1
    if (t < e.frozenUntil) return
    const speed = rt.dashLeft > 0
      ? dashSpeed(rt.baseSpeed)
      : rt.baseSpeed * e.speedMult * (isRush(ctx) ? 1.25 : 1)
    let budget = speed * h
    // A target more than a cell and a half away is stale (the enemy was
    // teleported); re-read the field rather than walk back to it.
    if (rt.target && distance(e.pos, centre(rt.target)) > 1.5) rt.target = null
    while (budget > 0) {
      if (!rt.target) {
        rt.target = nextCell(cellOf(e.pos))
        if (!rt.target) break
      }
      const tc = centre(rt.target)
      const dx = tc.x - e.pos.x
      const dy = tc.y - e.pos.y
      const d = Math.hypot(dx, dy)
      if (d > 1e-9) {
        e.dir.x = dx / d
        e.dir.y = dy / d
      }
      const moved = Math.min(d, budget)
      if (moved >= d) {
        e.pos.x = tc.x
        e.pos.y = tc.y
      } else {
        e.pos.x += e.dir.x * moved
        e.pos.y += e.dir.y * moved
      }
      budget -= moved
      e.progress += moved
      rt.dashLeft = Math.max(0, rt.dashLeft - moved)
      if (moved < d) break
      const reached = rt.target
      rt.target = null
      rt.trail.push(reached)
      if (sameCell(reached, grid.goal)) {
        leakEnemy(ctx, e)
        return
      }
      if (d === 0) break
    }
    const ahead = rt.target ?? cellOf(e.pos)
    e.remaining = Math.max(0, ctx.field.dist[index(grid, ahead)] ?? 0) + distance(e.pos, centre(ahead))
  }

  function stepEnemies(h: number): void {
    const t = state.time
    for (const e of state.enemies) {
      const rt = ctx.enemyRt.get(e.id)
      if (!rt || rt.gone) continue
      if (t < e.burnUntil && e.burnDps > 0) {
        hitEnemy(ctx, e, e.burnDps * h, { pierce: true, towerId: rt.burnTower, silent: true })
        if (rt.gone) continue
      }
      if (rt.healer) healAround(ctx, e, rt.healer.radius, rt.healer.hps * h)
      moveEnemy(e, rt, h)
      if (state.phase === 'lost') return
    }
  }

  // ── Towers ─────────────────────────────────────────────────────────
  function lineLength(stats: TowerStats): number {
    return Math.max(1, stats.range - (mods.has('fog') ? 1 : 0))
  }

  function enemiesByCell(): Map<number, EnemyState[]> {
    const by = new Map<number, EnemyState[]>()
    for (const e of alive(ctx)) {
      const c = cellOf(e.pos)
      if (!inBounds(grid, c.c, c.r)) continue
      const i = index(grid, c)
      const list = by.get(i)
      if (list) list.push(e)
      else by.set(i, [e])
    }
    return by
  }

  function pick(list: EnemyState[], mode: Targeting): EnemyState | undefined {
    let best: EnemyState | undefined
    for (const e of list) {
      if (!best) {
        best = e
        continue
      }
      const better = mode === 'first' ? e.progress > best.progress
        : mode === 'last' ? e.progress < best.progress
        : mode === 'strongest' ? e.hp > best.hp
        : e.hp < best.hp
      if (better) best = e
    }
    return best
  }

  function applyStatus(e: EnemyState, stats: TowerStats, towerId: number): void {
    if (isGone(ctx, e)) return
    const rt = ctx.enemyRt.get(e.id)
    const t = state.time
    if (stats.slow && rt && !rt.slowImmune) {
      e.speedMult = stats.slow.factor
      e.slowUntil = t + (e.boss ? stats.slow.seconds / 2 : stats.slow.seconds)
    }
    if (stats.burn && rt) {
      e.burnDps = stats.burn.dps
      e.burnUntil = t + stats.burn.seconds
      rt.burnTower = towerId
    }
  }

  function strike(tower: TowerState, e: EnemyState, dmg: number, stats: TowerStats): void {
    const at = { x: e.pos.x, y: e.pos.y }
    hitEnemy(ctx, e, dmg, { pierce: stats.pierce, towerId: tower.id })
    applyStatus(e, stats, tower.id)
    if (stats.splash) {
      for (const o of alive(ctx)) {
        if (o !== e && distance(o.pos, at) <= stats.splash) {
          hitEnemy(ctx, o, dmg * SPLASH_FRACTION, { pierce: stats.pierce, towerId: tower.id })
        }
      }
    }
    if (stats.chain) {
      const hit = new Set([e.id])
      let from = at
      let d = dmg
      for (let j = 0; j < stats.chain.targets; j++) {
        d *= stats.chain.falloff
        let next: EnemyState | undefined
        let nd = CHAIN_RANGE
        for (const o of alive(ctx)) {
          const od = distance(o.pos, from)
          if (!hit.has(o.id) && od <= nd) {
            next = o
            nd = od
          }
        }
        if (!next) break
        hit.add(next.id)
        const to = { x: next.pos.x, y: next.pos.y }
        addBeam(ctx, 'chain', from, to)
        hitEnemy(ctx, next, d, { pierce: stats.pierce, towerId: tower.id })
        from = to
      }
    }
  }

  function beamKind(type: TowerType): 'rook' | 'bishop' | 'queen' {
    return type === 'bishop' ? 'bishop' : type === 'queen' ? 'queen' : 'rook'
  }

  function fireTower(tower: TowerState, by: Map<number, EnemyState[]>): void {
    const def = TOWER_DEFS[tower.type]
    const stats = towerStats(def, tower.level, tower.branch)
    const pattern = towerPattern(def, tower.level, tower.branch)
    if (pattern.kind === 'aura') return
    const aura = tower.buffed ? ctx.aura : null
    const dmg = stats.damage * (aura?.damageMult ?? 1)
    const rate = stats.fireRate * (aura?.rateMult ?? 1)
    const from = centre(tower.cell)
    const hits: EnemyState[] = []
    if (pattern.kind === 'cells') {
      const cands: EnemyState[] = []
      for (const [dc, dr] of pattern.offsets) {
        const c = tower.cell.c + dc
        const r = tower.cell.r + dr
        if (!inBounds(grid, c, r)) continue
        const list = by.get(index(grid, { c, r }))
        if (list) cands.push(...list)
      }
      const target = pick(cands, tower.targeting)
      if (!target) return
      hits.push(target)
      addProjectile(ctx, tower.type === 'knight' ? 'jump' : 'arrow', from, target.pos)
    } else {
      const len = lineLength(stats)
      for (const [dc, dr] of pattern.dirs) {
        for (let k = 1; k <= len; k++) {
          const c = tower.cell.c + dc * k
          const r = tower.cell.r + dr * k
          if (!inBounds(grid, c, r)) break
          const list = by.get(index(grid, { c, r }))
          if (!list || list.length === 0) continue
          // Blocked like a real slider: only the first occupied cell.
          const target = pick(list, 'first')
          if (target) {
            hits.push(target)
            addBeam(ctx, beamKind(tower.type), from, target.pos)
          }
          break
        }
      }
    }
    const first = hits[0]
    if (!first) return
    ctx.events.push({ kind: 'shot', towerId: tower.id, from, to: { x: first.pos.x, y: first.pos.y }, towerType: tower.type })
    for (const e of hits) strike(tower, e, dmg, stats)
    ctx.towerReady.set(tower.id, state.time + 1 / rate)
  }

  function stepTowers(): void {
    const t = state.time
    const by = state.enemies.length > 0 ? enemiesByCell() : null
    for (const tower of state.towers) {
      const readyAt = ctx.towerReady.get(tower.id) ?? 0
      const stats = towerStats(TOWER_DEFS[tower.type], tower.level, tower.branch)
      const rate = stats.fireRate * (tower.buffed && ctx.aura ? ctx.aura.rateMult : 1)
      tower.cooldown = rate > 0 ? Math.max(0, Math.min(1, 1 - (readyAt - t) * rate)) : 1
      if (!by || t < tower.stunnedUntil || t < readyAt) continue
      fireTower(tower, by)
    }
  }

  // ── Effects ────────────────────────────────────────────────────────
  function stepFx(h: number): void {
    const s = state
    if (s.projectiles.length > 0) {
      for (const p of s.projectiles) p.t += (PROJECTILE_SPEED * h) / Math.max(0.25, distance(p.from, p.to))
      s.projectiles = s.projectiles.filter((p) => p.t < 1)
    }
    if (s.beams.length > 0) {
      for (const b of s.beams) b.ttl -= h
      s.beams = s.beams.filter((b) => b.ttl > 0)
    }
    if (s.telegraphs.length > 0) {
      for (const tg of s.telegraphs) tg.ttl -= h
      s.telegraphs = s.telegraphs.filter((tg) => tg.ttl > 0)
    }
  }

  function step(h: number): void {
    state.time += h
    if (state.phase === 'won' || state.phase === 'lost') {
      stepFx(h)
      return
    }
    if (state.phase === 'build') {
      state.countdown = Math.max(0, state.countdown - h)
      if (state.countdown === 0) beginWave()
    }
    if (state.phase === 'wave') processSpawns()
    stepEnemies(h)
    stepBosses(ctx, h)
    stepTowers()
    stepFx(h)
    sweep(ctx)
    if (state.phase === 'wave') checkClear()
  }

  // ── Economy helpers ────────────────────────────────────────────────
  function typeBan(type: TowerType): string | undefined {
    if (type === 'queen' && mods.has('noQueens')) return 'queens are banned here'
    if (type === 'king') {
      if (mods.has('noKing')) return 'no king on this map'
      if (state.towers.some((t) => t.type === 'king')) return 'only one king'
    }
    return undefined
  }

  function towerAt(cell: Cell): TowerState | null {
    return state.towers.find((t) => sameCell(t.cell, cell)) ?? null
  }

  function canBuild(cell: Cell, type: TowerType): { ok: boolean; reason?: string } {
    const kind = kindAt(grid, cell)
    if (kind !== 'plot' && kind !== 'open') return { ok: false, reason: 'not buildable' }
    if (towerAt(cell)) return { ok: false, reason: 'occupied' }
    const ban = typeBan(type)
    if (ban) return { ok: false, reason: ban }
    if (mods.has('maxTowers8') && state.towers.length >= MAX_TOWERS) return { ok: false, reason: 'tower limit' }
    if (kind === 'open' && wouldBlock(grid, ctx.blocked, cell)) return { ok: false, reason: 'blocked path' }
    if (state.gold < TOWER_DEFS[type].cost) return { ok: false, reason: 'not enough gold' }
    return { ok: true }
  }

  function onTowersChanged(cell: Cell): void {
    if (kindAt(grid, cell) === 'open') recomputeField(ctx)
    recomputeBuffs(ctx)
  }

  function canUpgrade(towerId: number): { ok: boolean; cost: number; reason?: string } {
    const tower = findTower(ctx, towerId)
    if (!tower) return { ok: false, cost: 0, reason: 'no such tower' }
    const def = TOWER_DEFS[tower.type]
    if (tower.level === 3) return { ok: false, cost: 0, reason: 'max level' }
    if (tower.level === 2) return { ok: false, cost: def.branches[0].cost, reason: 'choose a branch' }
    if (state.gold < def.upgradeCost) return { ok: false, cost: def.upgradeCost, reason: 'not enough gold' }
    return { ok: true, cost: def.upgradeCost }
  }

  function canPromote(towerId: number, to: TowerType): { ok: boolean; cost: number; reason?: string } {
    const tower = findTower(ctx, towerId)
    if (!tower) return { ok: false, cost: 0, reason: 'no such tower' }
    if (tower.type !== 'pawn' || to === 'pawn') return { ok: false, cost: 0, reason: 'only pawns promote' }
    const cost = TOWER_DEFS[to].cost - PROMOTE_DISCOUNT
    const ban = typeBan(to)
    if (ban) return { ok: false, cost, reason: ban }
    if (state.gold < cost) return { ok: false, cost, reason: 'not enough gold' }
    return { ok: true, cost }
  }

  function attackCells(type: TowerType, cell: Cell, level: TowerLevel, branch: string | null): Cell[] {
    const def = TOWER_DEFS[type]
    const pattern = towerPattern(def, level, branch)
    const out: Cell[] = []
    if (pattern.kind === 'lines') {
      const len = lineLength(towerStats(def, level, branch))
      for (const [dc, dr] of pattern.dirs) {
        for (let k = 1; k <= len; k++) {
          const c = cell.c + dc * k
          const r = cell.r + dr * k
          if (!inBounds(grid, c, r)) break
          out.push({ c, r })
        }
      }
      return out
    }
    for (const [dc, dr] of pattern.offsets) {
      const c = cell.c + dc
      const r = cell.r + dr
      if (inBounds(grid, c, r)) out.push({ c, r })
    }
    return out
  }

  const sim: Sim = {
    state,
    map,

    tick(dt: number): SimEvent[] {
      const wall = Math.min(MAX_DT, Math.max(0, dt))
      if (!state.paused && wall > 0) {
        if (state.bossIntro < 1) {
          state.bossIntro = Math.min(1, state.bossIntro + wall / INTRO_SECONDS)
          if (state.bossIntro >= 1) state.introBoss = null
        }
        const slow = state.bossIntro > 0.2 && state.bossIntro < 0.8 ? 0.25 : 1
        tickSpells(state, wall * state.speed)
        ctx.acc += wall * state.speed * slow
        while (ctx.acc >= STEP - 1e-9) {
          ctx.acc -= STEP
          step(STEP)
        }
      }
      const out = ctx.events
      ctx.events = []
      return out
    },

    canBuild,

    build(cell: Cell, type: TowerType): boolean {
      if (!canBuild(cell, type).ok) return false
      const def = TOWER_DEFS[type]
      const tower: TowerState = {
        id: nextId(ctx),
        type,
        cell: { c: cell.c, r: cell.r },
        level: 1,
        branch: null,
        targeting: def.defaultTargeting,
        stunnedUntil: 0,
        kills: 0,
        spent: def.cost,
        buffed: false,
        cooldown: 1,
      }
      state.gold -= def.cost
      state.towers.push(tower)
      ctx.towerReady.set(tower.id, 0)
      onTowersChanged(cell)
      ctx.events.push({ kind: 'build', towerId: tower.id, type, cell: tower.cell })
      return true
    },

    canUpgrade,

    upgrade(towerId: number): boolean {
      const r = canUpgrade(towerId)
      const tower = findTower(ctx, towerId)
      if (!r.ok || !tower) return false
      state.gold -= r.cost
      tower.spent += r.cost
      tower.level = 2
      recomputeBuffs(ctx)
      ctx.events.push({ kind: 'upgrade', towerId, level: 2, branch: null })
      return true
    },

    chooseBranch(towerId: number, branchId: string): boolean {
      const tower = findTower(ctx, towerId)
      if (!tower || tower.level !== 2) return false
      const branch = TOWER_DEFS[tower.type].branches.find((b) => b.id === branchId)
      if (!branch || state.gold < branch.cost) return false
      state.gold -= branch.cost
      tower.spent += branch.cost
      tower.level = 3
      tower.branch = branch.id
      recomputeBuffs(ctx)
      ctx.events.push({ kind: 'upgrade', towerId, level: 3, branch: branch.id })
      return true
    },

    canPromote,

    promote(towerId: number, to: TowerType): boolean {
      const r = canPromote(towerId, to)
      const tower = findTower(ctx, towerId)
      if (!r.ok || !tower) return false
      state.gold -= r.cost
      tower.spent += r.cost
      tower.type = to
      tower.level = 1
      tower.branch = null
      tower.targeting = TOWER_DEFS[to].defaultTargeting
      ctx.towerReady.set(tower.id, 0)
      recomputeBuffs(ctx)
      ctx.events.push({ kind: 'promote', towerId, to })
      return true
    },

    sell(towerId: number): number {
      const tower = findTower(ctx, towerId)
      if (!tower) return 0
      const refund = Math.floor(tower.spent * SELL_FRACTION)
      state.gold += refund
      state.towers = state.towers.filter((t) => t !== tower)
      ctx.towerReady.delete(towerId)
      onTowersChanged(tower.cell)
      ctx.events.push({ kind: 'sell', cell: tower.cell, refund })
      return refund
    },

    setTargeting(towerId: number, mode: Targeting): void {
      const tower = findTower(ctx, towerId)
      if (tower) tower.targeting = mode
    },

    castSpell(id: SpellId, target: SpellTarget): boolean {
      return castSpell(ctx, id, target)
    },

    startWave(): void {
      if (state.phase !== 'build') return
      state.gold += EARLY_START_GOLD * Math.floor(state.countdown)
      beginWave()
    },

    skipIntro(): void {
      state.bossIntro = 1
      state.introBoss = null
    },

    setSpeed(speed: 1 | 2): void {
      state.speed = speed
    },

    setPaused(paused: boolean): void {
      state.paused = paused
    },

    attackCells,
    towerAt,

    cellKind(cell: Cell): CellKind | null {
      return kindAt(grid, cell)
    },
  }
  return sim
}
