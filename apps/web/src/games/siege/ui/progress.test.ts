// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { MapDef } from '../sim/types'
import {
  PROGRESS_KEY,
  emptyProgress,
  isMapUnlocked,
  loadProgress,
  parseProgress,
  saveProgress,
  totalStars,
  unlockedSpells,
  withAchievement,
  withCampaignResult,
  withDailyResult,
  withEndlessResult,
} from './progress'

function map(id: string, order: number, unlocksSpell?: MapDef['unlocksSpell']): MapDef {
  return {
    id,
    order,
    name: id,
    subtitle: '',
    theme: 'courtyard',
    cols: 12,
    rows: 8,
    cells: [],
    waves: [],
    modifiers: [],
    startGold: 100,
    lives: 20,
    intro: '',
    ...(unlocksSpell ? { unlocksSpell } : {}),
  }
}

const campaign = [map('gate', 1), map('garden', 2, 'fork'), map('bridge', 3), map('forest', 4, 'pin')]

describe('progress storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns empty progress when nothing is stored', () => {
    expect(loadProgress()).toEqual(emptyProgress())
  })

  it('round-trips through localStorage', () => {
    const p = withAchievement(withCampaignResult(emptyProgress(), 'gate', 2, 1234), 'first-blood')
    saveProgress(p)
    expect(loadProgress()).toEqual(p)
  })

  it('survives corrupt JSON', () => {
    window.localStorage.setItem(PROGRESS_KEY, '{not json')
    expect(loadProgress()).toEqual(emptyProgress())
  })

  it('drops malformed fields but keeps the good ones', () => {
    const p = parseProgress({
      stars: { gate: 3, garden: 'x' },
      best: null,
      endlessBest: { wave: 'a' },
      dailyBest: { '2026-09-25': { wave: 4, score: 900 }, bad: 5 },
      achievements: ['perfect', 7],
    })
    expect(p.stars).toEqual({ gate: 3 })
    expect(p.best).toEqual({})
    expect(p.endlessBest).toEqual({ wave: 0, score: 0 })
    expect(p.dailyBest).toEqual({ '2026-09-25': { wave: 4, score: 900 } })
    expect(p.achievements).toEqual(['perfect'])
  })
})

describe('progress updates', () => {
  it('campaign results never lower stars or score', () => {
    let p = withCampaignResult(emptyProgress(), 'gate', 3, 2000)
    p = withCampaignResult(p, 'gate', 1, 500)
    expect(p.stars.gate).toBe(3)
    expect(p.best.gate).toBe(2000)
    p = withCampaignResult(p, 'gate', 2, 2500)
    expect(p.stars.gate).toBe(3)
    expect(p.best.gate).toBe(2500)
  })

  it('endless and daily bests are by score', () => {
    let p = withEndlessResult(emptyProgress(), 12, 1800)
    expect(withEndlessResult(p, 15, 1500)).toBe(p)
    p = withEndlessResult(p, 14, 2100)
    expect(p.endlessBest).toEqual({ wave: 14, score: 2100 })

    p = withDailyResult(p, '2026-09-25', 8, 900)
    expect(withDailyResult(p, '2026-09-25', 9, 800)).toBe(p)
    p = withDailyResult(p, '2026-09-26', 3, 100)
    expect(p.dailyBest).toEqual({ '2026-09-25': { wave: 8, score: 900 }, '2026-09-26': { wave: 3, score: 100 } })
  })

  it('achievements are idempotent', () => {
    const p = withAchievement(emptyProgress(), 'perfect')
    expect(withAchievement(p, 'perfect')).toBe(p)
    expect(withAchievement(p, 'checkmate').achievements).toEqual(['perfect', 'checkmate'])
  })
})

describe('derived progress', () => {
  it('unlocks the next map once the previous one has a star', () => {
    const p = withCampaignResult(emptyProgress(), 'gate', 1, 100)
    expect(isMapUnlocked(p, campaign, 0)).toBe(true)
    expect(isMapUnlocked(p, campaign, 1)).toBe(true)
    expect(isMapUnlocked(p, campaign, 2)).toBe(false)
    expect(isMapUnlocked(emptyProgress(), campaign, 1)).toBe(false)
  })

  it('derives spells from stars on the unlocking map', () => {
    expect(unlockedSpells(emptyProgress(), campaign)).toEqual([])
    const p = withCampaignResult(emptyProgress(), 'garden', 1, 100)
    expect(unlockedSpells(p, campaign)).toEqual(['fork'])
    expect(unlockedSpells(withCampaignResult(p, 'forest', 3, 100), campaign)).toEqual(['fork', 'pin'])
  })

  it('sums stars across the campaign only', () => {
    let p = withCampaignResult(emptyProgress(), 'gate', 3, 1)
    p = withCampaignResult(p, 'garden', 2, 1)
    p = withCampaignResult(p, 'not-a-campaign-map', 3, 1)
    expect(totalStars(p, campaign)).toBe(5)
  })
})
