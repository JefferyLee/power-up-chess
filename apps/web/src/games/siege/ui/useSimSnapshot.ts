// useSimSnapshot — the HUD's window onto `sim.state`. The renderer reads
// the state every frame through refs; the HUD must NOT re-render per
// tick, so this hook copies the handful of primitives it needs into
// React state at 10 Hz and skips the update when nothing changed.
//
// It also pauses the sim when the tab is hidden (visibilitychange). It
// leaves it paused on return so the kid sees "Paused" instead of a
// half-eaten wall.

import { useEffect, useState } from 'react'
import type { BossId, Cell, Phase, Sim, SpellId, SpellState, Targeting, TowerLevel, TowerType } from '../sim/types'

export interface TowerSnapshot {
  id: number
  type: TowerType
  cell: Cell
  level: TowerLevel
  branch: string | null
  targeting: Targeting
  kills: number
  spent: number
  stunned: boolean
  buffed: boolean
}

export interface BossSnapshot {
  type: BossId
  hp: number
  maxHp: number
  phase: number
  shieldLayers: number
}

export interface SimSnapshot {
  phase: Phase
  gold: number
  lives: number
  livesMax: number
  wave: number
  waveTotal: number
  countdown: number
  speed: 1 | 2
  paused: boolean
  pending: number
  score: number
  kills: number
  enemyCount: number
  towerCount: number
  hasKing: boolean
  bossIntro: number
  introBoss: BossId | null
  boss: BossSnapshot | null
  spells: Record<SpellId, SpellState>
  selectedTower: TowerSnapshot | null
}

export const SPELL_IDS: readonly SpellId[] = ['fork', 'pin', 'skewer', 'castling']

export function readSnapshot(sim: Sim, selectedTowerId: number | null): SimSnapshot {
  const s = sim.state
  const spells = {} as Record<SpellId, SpellState>
  for (const id of SPELL_IDS) {
    const sp = s.spells[id]
    spells[id] = { ready: sp.ready, cooldown: Math.ceil(sp.cooldown * 10) / 10, unlocked: sp.unlocked }
  }
  const t = selectedTowerId === null ? undefined : s.towers.find((x) => x.id === selectedTowerId)
  const selectedTower: TowerSnapshot | null = t
    ? {
        id: t.id,
        type: t.type,
        cell: { c: t.cell.c, r: t.cell.r },
        level: t.level,
        branch: t.branch,
        targeting: t.targeting,
        kills: t.kills,
        spent: t.spent,
        stunned: t.stunnedUntil > s.time,
        buffed: t.buffed,
      }
    : null
  const b = s.boss
  return {
    phase: s.phase,
    gold: Math.floor(s.gold),
    lives: s.lives,
    livesMax: s.livesMax,
    wave: s.wave,
    waveTotal: s.waveTotal,
    countdown: Math.ceil(s.countdown * 10) / 10,
    speed: s.speed,
    paused: s.paused,
    pending: s.pending,
    score: Math.floor(s.score),
    kills: s.kills,
    enemyCount: s.enemies.length,
    towerCount: s.towers.length,
    hasKing: s.towers.some((x) => x.type === 'king'),
    bossIntro: s.bossIntro,
    introBoss: s.introBoss,
    boss: b ? { type: b.type as BossId, hp: Math.ceil(b.hp), maxHp: b.maxHp, phase: b.phase, shieldLayers: b.shieldLayers } : null,
    spells,
    selectedTower,
  }
}

function sameTower(a: TowerSnapshot | null, b: TowerSnapshot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id && a.type === b.type && a.cell.c === b.cell.c && a.cell.r === b.cell.r && a.level === b.level &&
    a.branch === b.branch && a.targeting === b.targeting && a.kills === b.kills && a.spent === b.spent &&
    a.stunned === b.stunned && a.buffed === b.buffed
  )
}

function sameBoss(a: BossSnapshot | null, b: BossSnapshot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.type === b.type && a.hp === b.hp && a.maxHp === b.maxHp && a.phase === b.phase && a.shieldLayers === b.shieldLayers
}

export function sameSnapshot(a: SimSnapshot, b: SimSnapshot): boolean {
  if (
    a.phase !== b.phase || a.gold !== b.gold || a.lives !== b.lives || a.livesMax !== b.livesMax || a.wave !== b.wave ||
    a.waveTotal !== b.waveTotal || a.countdown !== b.countdown || a.speed !== b.speed || a.paused !== b.paused ||
    a.pending !== b.pending || a.score !== b.score || a.kills !== b.kills || a.enemyCount !== b.enemyCount ||
    a.towerCount !== b.towerCount || a.hasKing !== b.hasKing || a.bossIntro !== b.bossIntro || a.introBoss !== b.introBoss
  ) return false
  for (const id of SPELL_IDS) {
    const x = a.spells[id]
    const y = b.spells[id]
    if (x.ready !== y.ready || x.cooldown !== y.cooldown || x.unlocked !== y.unlocked) return false
  }
  return sameBoss(a.boss, b.boss) && sameTower(a.selectedTower, b.selectedTower)
}

export function useSimSnapshot(sim: Sim, selectedTowerId: number | null): SimSnapshot {
  const [snap, setSnap] = useState(() => readSnapshot(sim, selectedTowerId))

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = readSnapshot(sim, selectedTowerId)
      setSnap((prev) => (sameSnapshot(prev, next) ? prev : next))
    }, 100)
    return () => window.clearInterval(id)
  }, [sim, selectedTowerId])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') sim.setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [sim])

  return snap
}
