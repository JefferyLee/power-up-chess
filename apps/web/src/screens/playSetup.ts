// What the Local Chess and Practice-with-host screens need to start, and
// how the Hall builds it from the signed-in guest and the clock they
// picked. Shared with the two routes, so a game opened by address (a
// bookmark, the Corner of Babel's door) starts exactly as one opened from
// the Hall.

import type { CastleIdentity } from '../castle/identity'
import type { HostId } from '../hosts/hosts'
import type { DifficultyId } from '../ai/difficulty'
import type { TimeControl, TimeControlPreset } from '../clock/timeControl'
import { pickRandomHost, type Profile } from '../storage/profile'
import { PLAY_GATE_POINTS } from '../routes'

export const DEFAULT_OPPONENT_NAME = 'Friend'

export interface LocalState {
  hostId: HostId
  coHostId?: HostId
  whiteName: string
  blackName: string
  timeControl?: TimeControl | null
}

export interface AiState {
  hostId: HostId
  coHostId?: HostId
  playerName: string
  difficultyId: DifficultyId
  /** Optional chess clock chosen via the TimeControlDialog.
   *  null/undefined = untimed (no Clock renders). */
  timeControl?: TimeControl | null
}

export function localGameState(identity: CastleIdentity, preset: TimeControlPreset): LocalState {
  return {
    hostId: pickRandomHost(),
    whiteName: identity.displayName,
    blackName: DEFAULT_OPPONENT_NAME,
    timeControl: preset.value,
  }
}

export function aiPracticeState(
  identity: CastleIdentity,
  profile: Profile,
  preset: TimeControlPreset,
): AiState {
  return {
    hostId: pickRandomHost(),
    playerName: identity.displayName,
    difficultyId: profile.aiDifficultyId as DifficultyId,
    timeControl: preset.value,
  }
}

/** The Practice door's gate, exactly as the Hall applies it. */
export function canPractice(identity: CastleIdentity): boolean {
  return identity.castlePoints >= PLAY_GATE_POINTS && !identity.isBypass
}
