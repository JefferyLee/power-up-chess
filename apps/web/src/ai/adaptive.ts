// Adaptive AI difficulty (Phase 6 C6). Instead of a fixed level, the AI can
// climb the DIFFICULTY_PRESETS ladder when the kid wins and step down when they
// lose — so practice stays a fair, winnable challenge as Ada improves.
//
// State is a single stored index into DIFFICULTY_PRESETS plus an on/off flag.

import { DIFFICULTY_PRESETS } from './difficulty'

const IDX_KEY = 'puc:ai-adaptive-idx'
const ON_KEY = 'puc:ai-adaptive-on'
const MAX = DIFFICULTY_PRESETS.length - 1

const clamp = (i: number) => Math.max(0, Math.min(MAX, i))

export function getAdaptiveIndex(): number {
  try {
    const v = parseInt(localStorage.getItem(IDX_KEY) ?? '', 10)
    return Number.isFinite(v) ? clamp(v) : 0
  } catch {
    return 0
  }
}

export function setAdaptiveIndex(i: number): number {
  const c = clamp(i)
  try { localStorage.setItem(IDX_KEY, String(c)) } catch { /* private mode */ }
  return c
}

/** Win → one step harder, loss → one step easier, draw → hold. New index. */
export function recordAdaptiveResult(result: 'win' | 'loss' | 'draw'): number {
  const cur = getAdaptiveIndex()
  const next = result === 'win' ? cur + 1 : result === 'loss' ? cur - 1 : cur
  return setAdaptiveIndex(next)
}

export function isAdaptiveOn(): boolean {
  try { return localStorage.getItem(ON_KEY) === '1' } catch { return false }
}

export function setAdaptiveOn(on: boolean): void {
  try { localStorage.setItem(ON_KEY, on ? '1' : '0') } catch { /* private mode */ }
}
