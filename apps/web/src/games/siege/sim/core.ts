// Internal plumbing shared by sim.ts, bosses.ts and spells.ts: the mutable
// context plus spawn / damage / kill helpers. Not part of the contract —
// nothing outside sim/ imports this.
import type {
  BeamState,
  BossId,
  Cell,
  EnemyState,
  EnemyType,
  MapDef,
  Modifier,
  ProjectileState,
  SimEvent,
  SimState,
  Telegraph,
  TowerState,
  Vec2,
} from './types'
import type { BossRt } from './bosses'
import { ENEMY_DEFS, TOWER_DEFS, isBossId, towerPattern, towerStats } from './defs'
import { computeField, extractPath, inBounds, index, walkable, type FlowField, type Grid } from './path'

export const STEP = 1 / 60
export const INTRO_SECONDS = 2.5
export const PROJECTILE_SPEED = 8
export const BEAM_LIFE = 0.18
export const CHAIN_RANGE = 2.5
export const COMBO_WINDOW = 1.5
export const COMBO_MIN = 5
export const COMBO_SCORE = 25
export const MAX_ARMOR = 0.95

export interface EnemyRt {
  baseSpeed: number
  leak: number
  reward: number
  slowImmune: boolean
  healer: { radius: number; hps: number } | null
  /** Cell centre it is walking to; null = read the field at its cell. */
  target: Cell | null
  /** Cells reached so far (teleport-back walks this backwards). */
  trail: Cell[]
  /** Cells still to cover at dash speed (boss dash). */
  dashLeft: number
  /** Tower credited for a burn kill. */
  burnTower: number
  gone: boolean
}

export interface SpawnEntry {
  at: number
  type: EnemyType
  gate: number
  /** Boss reinforcements stop coming when the boss dies. */
  fromBoss: boolean
}

export interface Aura {
  damageMult: number
  rateMult: number
  goldMult: number
}

export interface Ctx {
  state: SimState
  map: MapDef
  mods: ReadonlySet<Modifier>
  rng: () => number
  grid: Grid
  field: FlowField
  blocked: Set<number>
  events: SimEvent[]
  ids: { next: number }
  enemyRt: Map<number, EnemyRt>
  /** Sim time at which each tower may fire again. */
  towerReady: Map<number, number>
  bossRt: Map<number, BossRt>
  /** The king's aura stats while a king stands on the board. */
  aura: Aura | null
  queue: SpawnEntry[]
  bossPending: { id: BossId; at: number } | null
  waveHpMult: number
  wavesCleared: number
  rewards: number
  bonuses: number
  comboScore: number
  starBonus: number
  killTimes: number[]
  /** Telegraphed boss abilities waiting for their warning to run out. */
  pendingAbilities: { at: number; enemyId: number; run: () => void }[]
  /** Fixed-step accumulator (seconds). */
  acc: number
  /** Something died this step — sweep the enemy list. */
  dirty: boolean
}

export function nextId(ctx: Ctx): number {
  return ctx.ids.next++
}

export function centre(cell: Cell): Vec2 {
  return { x: cell.c + 0.5, y: cell.r + 0.5 }
}

export function cellOf(pos: Vec2): Cell {
  return { c: Math.floor(pos.x), r: Math.floor(pos.y) }
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.c === b.c && a.r === b.r
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function findTower(ctx: Ctx, id: number): TowerState | undefined {
  return ctx.state.towers.find((t) => t.id === id)
}

export function isRush(ctx: Ctx): boolean {
  return ctx.mods.has('rush')
}

export function shieldBonus(ctx: Ctx): number {
  return ctx.mods.has('shielded') ? 0.2 : 0
}

/** Live (not yet removed) enemies. */
export function alive(ctx: Ctx): EnemyState[] {
  return ctx.state.enemies.filter((e) => !ctx.enemyRt.get(e.id)?.gone)
}

export function isGone(ctx: Ctx, e: EnemyState): boolean {
  return ctx.enemyRt.get(e.id)?.gone !== false
}

// ── Spawning ─────────────────────────────────────────────────────────
export interface EnemyInit {
  type: EnemyType | BossId
  boss: boolean
  decoy: boolean
  hp: number
  armor: number
  speed: number
  reward: number
  leak: number
  at: Vec2
  progress: number
  slowImmune: boolean
  healer: { radius: number; hps: number } | null
}

export function makeEnemy(ctx: Ctx, init: EnemyInit): EnemyState {
  const t = ctx.state.time
  const e: EnemyState = {
    id: nextId(ctx),
    type: init.type,
    boss: init.boss,
    decoy: init.decoy,
    hp: init.hp,
    maxHp: init.hp,
    armor: Math.min(MAX_ARMOR, init.armor + shieldBonus(ctx)),
    pos: { x: init.at.x, y: init.at.y },
    dir: { x: 1, y: 0 },
    progress: init.progress,
    remaining: 0,
    speedMult: 1,
    slowUntil: 0,
    frozenUntil: 0,
    burnUntil: 0,
    burnDps: 0,
    shieldLayers: 0,
    phase: 0,
    spawnedAt: t,
    hitAt: -1,
  }
  ctx.enemyRt.set(e.id, {
    baseSpeed: init.speed,
    leak: init.leak,
    reward: init.reward,
    slowImmune: init.slowImmune,
    healer: init.healer,
    target: null,
    trail: [cellOf(init.at)],
    dashLeft: 0,
    burnTower: -1,
    gone: false,
  })
  ctx.state.enemies.push(e)
  ctx.events.push({ kind: 'spawn', enemyId: e.id, at: { x: e.pos.x, y: e.pos.y }, type: e.type })
  return e
}

export function spawnEnemy(ctx: Ctx, type: EnemyType, at: Vec2, progress = 0): EnemyState {
  const d = ENEMY_DEFS[type]
  return makeEnemy(ctx, {
    type,
    boss: false,
    decoy: false,
    hp: d.hp * ctx.waveHpMult,
    armor: d.armor,
    speed: d.speed,
    reward: d.reward,
    leak: d.leak,
    at,
    progress,
    slowImmune: d.slowImmune === true,
    healer: d.healer ?? null,
  })
}

/** Keeps the spawn queue ordered by time. */
export function enqueueSpawn(ctx: Ctx, entry: SpawnEntry): void {
  const q = ctx.queue
  let i = q.length
  while (i > 0 && (q[i - 1]?.at ?? 0) > entry.at) i--
  q.splice(i, 0, entry)
  ctx.state.pending = q.length + (ctx.bossPending ? 1 : 0)
}

// ── Damage ───────────────────────────────────────────────────────────
export interface HitOpts {
  pierce?: boolean
  towerId?: number
  /** Burn ticks: no per-step 'hit' event. */
  silent?: boolean
}

export function hitEnemy(ctx: Ctx, e: EnemyState, raw: number, opts: HitOpts = {}): void {
  if (isGone(ctx, e)) return
  const dmg = opts.pierce ? raw : raw * (1 - e.armor)
  e.hp -= dmg
  e.hitAt = ctx.state.time
  if (!opts.silent) {
    ctx.events.push({ kind: 'hit', enemyId: e.id, at: { x: e.pos.x, y: e.pos.y }, damage: dmg, crit: false })
  }
  if (e.hp <= 0) killEnemy(ctx, e, opts.towerId)
}

function removeEnemy(ctx: Ctx, e: EnemyState, rt: EnemyRt): void {
  rt.gone = true
  e.hp = Math.min(e.hp, 0)
  ctx.dirty = true
  if (e.boss) {
    ctx.state.boss = null
    ctx.queue = ctx.queue.filter((q) => !q.fromBoss)
    ctx.pendingAbilities = ctx.pendingAbilities.filter((p) => p.enemyId !== e.id)
    ctx.state.pending = ctx.queue.length + (ctx.bossPending ? 1 : 0)
  }
}

export function killEnemy(ctx: Ctx, e: EnemyState, towerId?: number): void {
  const rt = ctx.enemyRt.get(e.id)
  if (!rt || rt.gone) return
  removeEnemy(ctx, e, rt)
  const s = ctx.state
  const tower = towerId === undefined ? undefined : findTower(ctx, towerId)
  const goldMult = tower?.buffed && ctx.aura ? ctx.aura.goldMult : 1
  const reward = Math.round(rt.reward * goldMult)
  s.gold += reward
  ctx.rewards += reward
  s.kills++
  if (tower) tower.kills++
  const at = { x: e.pos.x, y: e.pos.y }
  if (e.boss && isBossId(e.type)) ctx.events.push({ kind: 'bossDefeat', boss: e.type, at })
  ctx.events.push({ kind: 'kill', enemyId: e.id, at, type: e.type, reward })
  // Combo: the 5th kill inside 1.5 s and every one after it.
  const t = s.time
  ctx.killTimes.push(t)
  ctx.killTimes = ctx.killTimes.filter((k) => t - k <= COMBO_WINDOW)
  if (ctx.killTimes.length >= COMBO_MIN) {
    ctx.comboScore += COMBO_SCORE
    ctx.events.push({ kind: 'combo', count: ctx.killTimes.length })
  }
  refreshScore(ctx)
}

export function leakEnemy(ctx: Ctx, e: EnemyState): void {
  const rt = ctx.enemyRt.get(e.id)
  if (!rt || rt.gone) return
  removeEnemy(ctx, e, rt)
  const s = ctx.state
  s.lives = Math.max(0, s.lives - rt.leak)
  s.leaks++
  ctx.events.push({ kind: 'leak', enemyId: e.id, livesLost: rt.leak })
  if (s.lives <= 0 && s.phase !== 'lost') {
    s.phase = 'lost'
    refreshScore(ctx)
    ctx.events.push({ kind: 'lost', wave: s.wave, score: s.score })
  }
}

/** Drops removed enemies from the live list (once per step). */
export function sweep(ctx: Ctx): void {
  if (!ctx.dirty) return
  ctx.dirty = false
  const keep: EnemyState[] = []
  for (const e of ctx.state.enemies) {
    if (ctx.enemyRt.get(e.id)?.gone) {
      ctx.enemyRt.delete(e.id)
      ctx.bossRt.delete(e.id)
    } else keep.push(e)
  }
  ctx.state.enemies = keep
}

export function refreshScore(ctx: Ctx): void {
  const s = ctx.state
  s.score = s.waveTotal === 0
    ? ctx.wavesCleared * 100 + ctx.rewards + ctx.comboScore
    : ctx.rewards + ctx.bonuses + ctx.comboScore + ctx.starBonus
}

// ── Towers ───────────────────────────────────────────────────────────
export function stunTower(ctx: Ctx, tower: TowerState, seconds: number): void {
  tower.stunnedUntil = Math.max(tower.stunnedUntil, ctx.state.time + seconds)
  ctx.events.push({ kind: 'stun', towerId: tower.id, seconds })
}

/** Recomputes the king's aura and every tower's `buffed` flag. */
export function recomputeBuffs(ctx: Ctx): void {
  const king = ctx.state.towers.find((t) => t.type === 'king')
  const covered = new Set<number>()
  ctx.aura = null
  if (king) {
    const def = TOWER_DEFS.king
    ctx.aura = towerStats(def, king.level, king.branch).aura ?? null
    const pattern = towerPattern(def, king.level, king.branch)
    if (pattern.kind === 'aura') {
      for (const [dc, dr] of pattern.offsets) {
        const c = king.cell.c + dc
        const r = king.cell.r + dr
        if (inBounds(ctx.grid, c, r)) covered.add(index(ctx.grid, { c, r }))
      }
    }
  }
  for (const t of ctx.state.towers) t.buffed = t !== king && covered.has(index(ctx.grid, t.cell))
}

/** Rebuilds the flow field after a tower lands on / leaves an open cell. */
export function recomputeField(ctx: Ctx): void {
  const blocked = new Set<number>()
  for (const t of ctx.state.towers) {
    if (ctx.grid.kinds[index(ctx.grid, t.cell)] === 'open') blocked.add(index(ctx.grid, t.cell))
  }
  ctx.blocked = blocked
  ctx.field = computeField(ctx.grid, blocked)
  ctx.state.paths = ctx.grid.gates.map((g) => extractPath(ctx.grid, ctx.field, g))
  // Anyone heading into a freshly blocked cell turns around at once.
  for (const e of ctx.state.enemies) {
    const rt = ctx.enemyRt.get(e.id)
    if (rt?.target && !walkable(ctx.grid, blocked, index(ctx.grid, rt.target))) rt.target = null
  }
}

// ── Effects (the view animates these) ────────────────────────────────
export function addProjectile(ctx: Ctx, kind: ProjectileState['kind'], from: Vec2, to: Vec2): void {
  ctx.state.projectiles.push({ id: nextId(ctx), kind, from: { ...from }, to: { ...to }, t: 0 })
}

export function addBeam(ctx: Ctx, kind: BeamState['kind'], from: Vec2, to: Vec2): void {
  ctx.state.beams.push({ id: nextId(ctx), kind, from: { ...from }, to: { ...to }, ttl: BEAM_LIFE, life: BEAM_LIFE })
}

export function addTelegraph(ctx: Ctx, kind: Telegraph['kind'], cells: Cell[], seconds: number, ability: Telegraph['ability']): Telegraph {
  const tg: Telegraph = { id: nextId(ctx), kind, cells, ttl: seconds, life: seconds, ability }
  ctx.state.telegraphs.push(tg)
  ctx.events.push({ kind: 'telegraph', telegraphId: tg.id })
  return tg
}
