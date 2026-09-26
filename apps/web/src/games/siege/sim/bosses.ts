// Boss runtime: phases, telegraphed abilities, summons, splits, auras.
// Phases are monotonic (a heal never steps back); one-shot abilities fire
// when their phase begins, timed ones repeat, auras run every step.
import type { BossAbility, BossDef, BossId, Cell, EnemyState, Vec2 } from './types'
import { BOSS_DEFS, DIAGONALS } from './defs'
import {
  addTelegraph,
  cellOf,
  centre,
  distance,
  enqueueSpawn,
  isGone,
  makeEnemy,
  sameCell,
  shieldBonus,
  spawnEnemy,
  stunTower,
  type Ctx,
} from './core'
import { inBounds, index, toCell } from './path'

type TimedAbility = Extract<BossAbility, { every: number }>

export interface BossRt {
  def: BossDef
  baseArmor: number
  armorPerLayer: number
  timed: { ability: TimedAbility; nextAt: number }[]
  auras: { radius: number; hps: number }[]
  splitDone: boolean
}

const DASH_SPEED_MULT = 6
const CALL_WAVE_GAP = 0.4

export function spawnBoss(ctx: Ctx, id: BossId, at: Vec2): EnemyState {
  const def = BOSS_DEFS[id]
  // Rule: bosses ignore the `shielded` modifier — their armour is the
  // table's (plus shield layers). makeEnemy adds the bonus to everyone,
  // so hand it the value that lands back on def.armor.
  const e = makeEnemy(ctx, {
    type: id,
    boss: true,
    decoy: false,
    hp: def.hp * ctx.waveHpMult,
    armor: def.armor - shieldBonus(ctx),
    speed: def.speed,
    reward: def.reward,
    leak: def.leak,
    at,
    progress: 0,
    slowImmune: false,
    healer: null,
  })
  const rt: BossRt = { def, baseArmor: e.armor, armorPerLayer: 0, timed: [], auras: [], splitDone: false }
  ctx.bossRt.set(e.id, rt)
  ctx.state.boss = e
  ctx.state.bossIntro = 0
  ctx.state.introBoss = id
  ctx.events.push({ kind: 'bossSpawn', boss: id, enemyId: e.id })
  enterPhase(ctx, e, rt, 0)
  return e
}

export function dashSpeed(base: number): number {
  return base * DASH_SPEED_MULT
}

export function stepBosses(ctx: Ctx, h: number): void {
  const t = ctx.state.time
  if (ctx.pendingAbilities.length > 0) {
    const due = ctx.pendingAbilities.filter((p) => p.at <= t)
    if (due.length > 0) {
      ctx.pendingAbilities = ctx.pendingAbilities.filter((p) => p.at > t)
      for (const p of due) p.run()
    }
  }
  for (const e of ctx.state.enemies) {
    const rt = ctx.bossRt.get(e.id)
    if (!rt || isGone(ctx, e)) continue
    const phases = rt.def.phases
    let nextPhase = phases[e.phase + 1]
    while (nextPhase && e.hp / e.maxHp <= nextPhase.atHpFraction && !isGone(ctx, e)) {
      enterPhase(ctx, e, rt, e.phase + 1)
      nextPhase = phases[e.phase + 1]
    }
    for (const tm of rt.timed) {
      if (t < tm.nextAt) continue
      tm.nextAt = t + tm.ability.every
      trigger(ctx, e, tm.ability)
    }
    for (const a of rt.auras) healAround(ctx, e, a.radius, a.hps * h)
  }
}

/** Heals every other live enemy within `radius` of `src` by `amount`. */
export function healAround(ctx: Ctx, src: EnemyState, radius: number, amount: number): void {
  for (const o of ctx.state.enemies) {
    if (o === src || isGone(ctx, o) || distance(o.pos, src.pos) > radius) continue
    o.hp = Math.min(o.maxHp, o.hp + amount)
  }
}

function enterPhase(ctx: Ctx, e: EnemyState, rt: BossRt, i: number): void {
  const ph = rt.def.phases[i]
  if (!ph) return
  e.phase = i
  if (i > 0) ctx.events.push({ kind: 'bossPhase', boss: rt.def.id, phase: i })
  const ert = ctx.enemyRt.get(e.id)
  if (ph.speed !== undefined && ert) ert.baseSpeed = ph.speed
  if (ph.armor !== undefined) rt.baseArmor = ph.armor // bosses ignore `shielded`
  if (ph.dropShieldLayers) e.shieldLayers = Math.max(0, e.shieldLayers - ph.dropShieldLayers)
  for (const a of ph.abilities) {
    switch (a.kind) {
      case 'shield':
        e.shieldLayers = a.layers
        rt.armorPerLayer = a.armorPerLayer
        break
      case 'teleportBack':
        teleportBack(ctx, e, a.cells, a.heal)
        break
      case 'split':
        if (!rt.splitDone) {
          rt.splitDone = true
          split(ctx, e, a.count, a.decoyHpFraction, a.decoyLeak)
        }
        break
      case 'healAura':
        rt.auras.push({ radius: a.radius, hps: a.hps })
        break
      default:
        rt.timed.push({ ability: a, nextAt: ctx.state.time + a.every })
    }
  }
  e.armor = Math.min(0.95, rt.baseArmor + e.shieldLayers * rt.armorPerLayer)
}

function abilityEvent(ctx: Ctx, e: EnemyState, ability: BossAbility['kind']): void {
  if (!e.boss) return
  const rt = ctx.bossRt.get(e.id)
  if (rt) ctx.events.push({ kind: 'bossAbility', boss: rt.def.id, ability, at: { x: e.pos.x, y: e.pos.y } })
}

function trigger(ctx: Ctx, e: EnemyState, ability: TimedAbility): void {
  const ert = ctx.enemyRt.get(e.id)
  if (!ert) return
  switch (ability.kind) {
    case 'summon': {
      for (let i = 0; i < ability.count; i++) {
        // A whisker of jitter so a stack of summons does not render as one piece.
        const at = { x: e.pos.x + (ctx.rng() - 0.5) * 0.3, y: e.pos.y + (ctx.rng() - 0.5) * 0.3 }
        spawnEnemy(ctx, ability.enemy, at, e.progress)
      }
      abilityEvent(ctx, e, 'summon')
      break
    }
    case 'callWave': {
      for (let i = 0; i < ability.count; i++) {
        enqueueSpawn(ctx, { at: ctx.state.time + i * CALL_WAVE_GAP, type: ability.enemy, gate: 0, fromBoss: true })
      }
      abilityEvent(ctx, e, 'callWave')
      break
    }
    case 'dash':
      defer(ctx, e, 'cells', pathAhead(ctx, e, ability.cells), ability.telegraph, 'dash', () => {
        ert.dashLeft = ability.cells
      })
      break
    case 'emp': {
      const cells = ringCells(ctx, cellOf(e.pos), ability.radius)
      defer(ctx, e, 'ring', cells, ability.telegraph, 'emp', () => stunCells(ctx, cells, ability.stun))
      break
    }
    case 'freezeLines': {
      const cells = diagonalCells(ctx, cellOf(e.pos), ability.length)
      defer(ctx, e, 'line', cells, ability.telegraph, 'freezeLines', () => stunCells(ctx, cells, ability.stun))
      break
    }
  }
}

/** Warns on `cells` for `seconds`, then runs `run` if the boss still lives. */
function defer(
  ctx: Ctx,
  e: EnemyState,
  kind: 'ring' | 'cells' | 'line',
  cells: Cell[],
  seconds: number,
  ability: BossAbility['kind'],
  run: () => void,
): void {
  addTelegraph(ctx, kind, cells, seconds, ability)
  ctx.pendingAbilities.push({
    at: ctx.state.time + seconds,
    enemyId: e.id,
    run: () => {
      if (isGone(ctx, e)) return
      run()
      abilityEvent(ctx, e, ability)
    },
  })
}

function stunCells(ctx: Ctx, cells: Cell[], seconds: number): void {
  for (const t of ctx.state.towers) {
    if (cells.some((c) => sameCell(c, t.cell))) stunTower(ctx, t, seconds)
  }
}

function ringCells(ctx: Ctx, at: Cell, radius: number): Cell[] {
  const out: Cell[] = []
  const r2 = radius * radius
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dc * dc + dr * dr > r2 || !inBounds(ctx.grid, at.c + dc, at.r + dr)) continue
      out.push({ c: at.c + dc, r: at.r + dr })
    }
  }
  return out
}

function diagonalCells(ctx: Ctx, at: Cell, length: number): Cell[] {
  const out: Cell[] = []
  for (const [dc, dr] of DIAGONALS) {
    for (let k = 1; k <= length; k++) {
      const c = at.c + dc * k
      const r = at.r + dr * k
      if (!inBounds(ctx.grid, c, r)) break
      out.push({ c, r })
    }
  }
  return out
}

/** The next `n` cells the enemy will walk through. */
function pathAhead(ctx: Ctx, e: EnemyState, n: number): Cell[] {
  const out: Cell[] = []
  const ert = ctx.enemyRt.get(e.id)
  let i = index(ctx.grid, ert?.target ?? cellOf(e.pos))
  while (out.length < n && i >= 0) {
    out.push(toCell(ctx.grid, i))
    i = ctx.field.next[i] ?? -1
  }
  return out
}

function teleportBack(ctx: Ctx, e: EnemyState, cells: number, heal: number): void {
  const ert = ctx.enemyRt.get(e.id)
  if (!ert) return
  const trail = ert.trail
  const back = Math.min(cells, trail.length - 1)
  const idx = trail.length - 1 - back
  const dest = trail[idx]
  if (dest) {
    trail.length = idx + 1
    const at = centre(dest)
    e.pos.x = at.x
    e.pos.y = at.y
    ert.target = null
    e.progress = Math.max(0, e.progress - back)
  }
  e.hp = Math.min(e.maxHp, e.hp + heal * e.maxHp)
  abilityEvent(ctx, e, 'teleportBack')
}

function split(ctx: Ctx, e: EnemyState, count: number, hpFraction: number, leak: number): void {
  const ert = ctx.enemyRt.get(e.id)
  if (!ert) return
  for (let i = 0; i < count; i++) {
    const d = makeEnemy(ctx, {
      type: e.type,
      boss: false,
      decoy: true,
      hp: e.hp * hpFraction,
      // makeEnemy adds the shielded bonus itself; hand it the bare value.
      armor: e.armor - shieldBonus(ctx),
      speed: ert.baseSpeed,
      reward: 0,
      leak,
      at: { x: e.pos.x + (ctx.rng() - 0.5) * 0.3, y: e.pos.y + (ctx.rng() - 0.5) * 0.3 },
      progress: e.progress,
      slowImmune: false,
      healer: null,
    })
    const drt = ctx.enemyRt.get(d.id)
    if (drt) drt.trail = [...ert.trail]
  }
  abilityEvent(ctx, e, 'split')
}
