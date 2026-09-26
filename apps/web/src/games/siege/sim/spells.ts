// Spells: cooldown-only, unlocked by campaign progress. A fork / pin /
// skewer with nobody under it is refused (no cooldown spent) so a stray
// tap does not cost Ada her spell.
import type { Cell, SimState, SpellId, SpellState, SpellTarget } from './types'
import { SPELL_DEFS } from './defs'
import { addBeam, alive, cellOf, findTower, hitEnemy, recomputeBuffs, type Ctx } from './core'

const FORK_DAMAGE = 120
const FORK_TARGETS = 2
const PIN_SECONDS = 3
const PIN_BOSS_SECONDS = 1.5
const SKEWER_DAMAGE = 90
const SPELL_IDS: readonly SpellId[] = ['fork', 'pin', 'skewer', 'castling']

export function initSpells(unlocked: readonly SpellId[]): Record<SpellId, SpellState> {
  const mk = (id: SpellId): SpellState => {
    const u = unlocked.includes(id)
    return { ready: u, cooldown: 0, unlocked: u }
  }
  return { fork: mk('fork'), pin: mk('pin'), skewer: mk('skewer'), castling: mk('castling') }
}

/** `seconds` is wall time × speed (the boss intro does not slow spells). */
export function tickSpells(state: SimState, seconds: number): void {
  for (const id of SPELL_IDS) {
    const sp = state.spells[id]
    if (sp.cooldown > 0) sp.cooldown = Math.max(0, sp.cooldown - seconds)
    sp.ready = sp.unlocked && sp.cooldown === 0
  }
}

export function castSpell(ctx: Ctx, id: SpellId, target: SpellTarget): boolean {
  const sp = ctx.state.spells[id]
  const phase = ctx.state.phase
  if (!sp.ready || (phase !== 'build' && phase !== 'wave')) return false
  let ok = false
  switch (id) {
    case 'fork':
      ok = target.kind === 'cell' && fork(ctx, target.cell)
      break
    case 'pin':
      ok = target.kind === 'cell' && pin(ctx, target.cell)
      break
    case 'skewer':
      ok = target.kind === 'line' && skewer(ctx, target.cell, target.orientation)
      break
    case 'castling':
      ok = target.kind === 'towers' && castling(ctx, target.a, target.b)
      break
  }
  if (!ok) return false
  sp.cooldown = SPELL_DEFS[id].cooldown
  sp.ready = false
  return true
}

function within(ctx: Ctx, cell: Cell, half: number) {
  return alive(ctx).filter((e) => {
    const c = cellOf(e.pos)
    return Math.abs(c.c - cell.c) <= half && Math.abs(c.r - cell.r) <= half
  })
}

function fork(ctx: Ctx, cell: Cell): boolean {
  const targets = within(ctx, cell, 2)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, FORK_TARGETS)
  if (targets.length === 0) return false
  ctx.events.push({ kind: 'spell', spell: 'fork', at: cell })
  for (const e of targets) hitEnemy(ctx, e, FORK_DAMAGE)
  return true
}

function pin(ctx: Ctx, cell: Cell): boolean {
  const targets = within(ctx, cell, 1)
  if (targets.length === 0) return false
  ctx.events.push({ kind: 'spell', spell: 'pin', at: cell })
  const t = ctx.state.time
  for (const e of targets) e.frozenUntil = Math.max(e.frozenUntil, t + (e.boss ? PIN_BOSS_SECONDS : PIN_SECONDS))
  return true
}

function skewer(ctx: Ctx, cell: Cell, orientation: 'row' | 'col'): boolean {
  const targets = alive(ctx).filter((e) => {
    const c = cellOf(e.pos)
    return orientation === 'row' ? c.r === cell.r : c.c === cell.c
  })
  if (targets.length === 0) return false
  ctx.events.push({ kind: 'spell', spell: 'skewer', at: cell })
  const { cols, rows } = ctx.grid
  if (orientation === 'row') addBeam(ctx, 'skewer', { x: 0, y: cell.r + 0.5 }, { x: cols, y: cell.r + 0.5 })
  else addBeam(ctx, 'skewer', { x: cell.c + 0.5, y: 0 }, { x: cell.c + 0.5, y: rows })
  for (const e of targets) hitEnemy(ctx, e, SKEWER_DAMAGE, { pierce: true })
  return true
}

function castling(ctx: Ctx, a: number, b: number): boolean {
  const ta = findTower(ctx, a)
  const tb = findTower(ctx, b)
  if (!ta || !tb || ta === tb) return false
  const cellA = ta.cell
  ta.cell = tb.cell
  tb.cell = cellA
  ta.stunnedUntil = 0
  tb.stunnedUntil = 0
  // The set of occupied cells is unchanged, so the flow field stands;
  // the king may have moved, so the aura does not.
  recomputeBuffs(ctx)
  ctx.events.push({ kind: 'spell', spell: 'castling', at: tb.cell })
  ctx.events.push({ kind: 'castling', a: tb.cell, b: ta.cell })
  return true
}
