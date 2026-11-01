import { describe, expect, it } from 'vitest'
import type { CastleIdentity } from '../castle/identity'
import type { TimeControlPreset } from '../clock/timeControl'
import type { Profile } from '../storage/profile'
import { aiPracticeState, canPractice, localGameState } from './playSetup'

const ada: CastleIdentity = {
  displayName: 'Ada',
  normalizedName: 'ada',
  castlePoints: 250,
  isBypass: false,
  isFirstVisit: false,
}
const tenMinutes = { value: { initialSeconds: 600, incrementSeconds: 0 } } as unknown as TimeControlPreset
const profile = { aiDifficultyId: 'medium' } as Profile

describe('playSetup', () => {
  it('starts a local game as the Hall does: the guest vs Friend, with the chosen clock', () => {
    const s = localGameState(ada, tenMinutes)
    expect(s.whiteName).toBe('Ada')
    expect(s.blackName).toBe('Friend')
    expect(s.timeControl).toBe(tenMinutes.value)
    expect(['lucy', 'luca']).toContain(s.hostId)
  })

  it('starts practice at the difficulty saved in the profile', () => {
    const s = aiPracticeState(ada, profile, tenMinutes)
    expect(s.playerName).toBe('Ada')
    expect(s.difficultyId).toBe('medium')
    expect(s.timeControl).toBe(tenMinutes.value)
  })

  it('keeps the Practice gate: 200 castle points, and never for bypass guests', () => {
    expect(canPractice({ ...ada, castlePoints: 199 })).toBe(false)
    expect(canPractice({ ...ada, castlePoints: 200 })).toBe(true)
    expect(canPractice({ ...ada, castlePoints: 900, isBypass: true })).toBe(false)
  })
})
