import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AiPracticeScreen } from './AiPracticeScreen'
import type { HostId } from '../hosts/hosts'
import type { DifficultyId } from '../ai/difficulty'

interface AiState {
  hostId: HostId
  coHostId?: HostId
  playerName: string
  difficultyId: DifficultyId
  // The Hall's TimeControlDialog passes this through when starting
  // a Practice game. AiPracticeScreen doesn't render a visible clock
  // yet — wiring per-side timers + flag detection is a follow-up.
  // For now we accept (and silently ignore) the chosen TC so the
  // route navigation contract matches Local/Online.
  // timeControl?: TimeControl | null
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
