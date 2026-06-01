import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AiPracticeScreen } from './AiPracticeScreen'
import type { HostId } from '../hosts/hosts'
import type { DifficultyId } from '../ai/difficulty'

interface AiState {
  hostId: HostId
  coHostId?: HostId
  playerName: string
  difficultyId: DifficultyId
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
      onExit={() => navigate('/')}
    />
  )
}
