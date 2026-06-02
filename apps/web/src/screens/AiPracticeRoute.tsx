import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AiPracticeScreen } from './AiPracticeScreen'
import type { HostId } from '../hosts/hosts'
import type { DifficultyId } from '../ai/difficulty'
import type { TimeControl } from '../clock/timeControl'

interface AiState {
  hostId: HostId
  coHostId?: HostId
  playerName: string
  difficultyId: DifficultyId
  /** Optional chess clock chosen via the Hall's TimeControlDialog.
   *  null/undefined = untimed (no Clock renders). */
  timeControl?: TimeControl | null
}

export function AiPracticeRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as AiState | null
  if (!state) return <Navigate to="/" replace />
  return (
    <AiPracticeScreen
      hostId={state.hostId}
      coHostId={state.coHostId}
      playerName={state.playerName}
      difficultyId={state.difficultyId}
      timeControl={state.timeControl ?? null}
      onExit={() => navigate('/')}
    />
  )
}
