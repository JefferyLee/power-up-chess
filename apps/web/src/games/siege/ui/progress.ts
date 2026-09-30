// Siege progress — campaign stars, best scores, endless / daily bests
// and local achievements. localStorage only (`puc.siege.progress`); no
// castle points are involved anywhere in the Siege.
//
// Spell unlocks are DERIVED, never stored: a map's `unlocksSpell` is
// yours once that map has at least one star.

import type { MapDef, SpellId } from '../sim/types'
import { KEYS, readJson, writeJson } from '../../../storage/keys'

export const PROGRESS_KEY = KEYS.siegeProgress.key

export type AchievementId =
  | 'first-blood'
  | 'promotion'
  | 'fork-two'
  | 'iron-breaker'
  | 'frostbite'
  | 'shadow-seer'
  | 'perfect'
  | 'checkmate'
  | 'endless-20'

export const ACHIEVEMENTS: ReadonlyArray<{ id: AchievementId; name: string; description: string }> = [
  { id: 'first-blood', name: 'First Capture', description: 'Your first piece of the black army, taken.' },
  { id: 'promotion', name: 'Promotion', description: 'A pawn reached the far side of its story and became something more.' },
  { id: 'fork-two', name: 'Fork', description: 'Cast Fork with two enemies in reach — one move, two targets.' },
  { id: 'iron-breaker', name: 'Iron Breaker', description: 'The Iron Rook lost its last shield layer and toppled.' },
  { id: 'frostbite', name: 'Frostbite', description: 'The Frost Bishop went down, freeze and all.' },
  { id: 'shadow-seer', name: 'Shadow Seer', description: 'Found the real Shadow Queen among her shadows.' },
  { id: 'perfect', name: 'Clean Sheet', description: 'Won a map without losing a single life.' },
  { id: 'checkmate', name: 'Checkmate', description: 'Held the Dark Throne. The Dark King resigned.' },
  { id: 'endless-20', name: 'Twenty Waves', description: 'The walls held for twenty waves in Endless.' },
]

export interface SiegeProgress {
  /** Map id → best stars (0..3). */
  stars: Record<string, number>
  /** Map id → best campaign score. */
  best: Record<string, number>
  endlessBest: { wave: number; score: number }
  /** Daily date key → best run that day. */
  dailyBest: Record<string, { wave: number; score: number }>
  achievements: string[]
}

export function emptyProgress(): SiegeProgress {
  return { stars: {}, best: {}, endlessBest: { wave: 0, score: 0 }, dailyBest: {}, achievements: [] }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
  return out
}

function waveScore(v: unknown): { wave: number; score: number } | null {
  if (!isRecord(v)) return null
  const wave = v.wave
  const score = v.score
  if (typeof wave !== 'number' || typeof score !== 'number') return null
  return { wave, score }
}

/** Parse a stored value, tolerating anything malformed field by field. */
export function parseProgress(raw: unknown): SiegeProgress {
  const p = emptyProgress()
  if (!isRecord(raw)) return p
  p.stars = numberMap(raw.stars)
  p.best = numberMap(raw.best)
  p.endlessBest = waveScore(raw.endlessBest) ?? p.endlessBest
  if (isRecord(raw.dailyBest)) {
    for (const [k, v] of Object.entries(raw.dailyBest)) {
      const ws = waveScore(v)
      if (ws) p.dailyBest[k] = ws
    }
  }
  if (Array.isArray(raw.achievements)) {
    p.achievements = raw.achievements.filter((a): a is string => typeof a === 'string')
  }
  return p
}

export function loadProgress(): SiegeProgress {
  return parseProgress(readJson(KEYS.siegeProgress))
}

/** A refused write (quota / private mode) just means the run isn't remembered — it still played. */
export function saveProgress(p: SiegeProgress): void {
  writeJson(KEYS.siegeProgress, p)
}

// ── Pure updates (return a new object; never lower a best) ───────────

export function withCampaignResult(p: SiegeProgress, mapId: string, stars: number, score: number): SiegeProgress {
  return {
    ...p,
    stars: { ...p.stars, [mapId]: Math.max(p.stars[mapId] ?? 0, stars) },
    best: { ...p.best, [mapId]: Math.max(p.best[mapId] ?? 0, score) },
  }
}

export function withEndlessResult(p: SiegeProgress, wave: number, score: number): SiegeProgress {
  if (score <= p.endlessBest.score) return p
  return { ...p, endlessBest: { wave, score } }
}

export function withDailyResult(p: SiegeProgress, dateKey: string, wave: number, score: number): SiegeProgress {
  const prior = p.dailyBest[dateKey]
  if (prior && score <= prior.score) return p
  return { ...p, dailyBest: { ...p.dailyBest, [dateKey]: { wave, score } } }
}

export function withAchievement(p: SiegeProgress, id: AchievementId): SiegeProgress {
  if (p.achievements.includes(id)) return p
  return { ...p, achievements: [...p.achievements, id] }
}

// ── Derived ──────────────────────────────────────────────────────────

export function totalStars(p: SiegeProgress, campaign: ReadonlyArray<MapDef>): number {
  let n = 0
  for (const m of campaign) n += p.stars[m.id] ?? 0
  return n
}

export function unlockedSpells(p: SiegeProgress, campaign: ReadonlyArray<MapDef>): SpellId[] {
  const out: SpellId[] = []
  for (const m of campaign) {
    if (m.unlocksSpell && (p.stars[m.id] ?? 0) >= 1 && !out.includes(m.unlocksSpell)) out.push(m.unlocksSpell)
  }
  return out
}

/** Map `index` (0-based in campaign order) is open when the previous
 *  map has at least one star. The first map is always open. */
export function isMapUnlocked(p: SiegeProgress, campaign: ReadonlyArray<MapDef>, index: number): boolean {
  if (index <= 0) return true
  const prev = campaign[index - 1]
  if (!prev) return false
  return (p.stars[prev.id] ?? 0) >= 1
}
