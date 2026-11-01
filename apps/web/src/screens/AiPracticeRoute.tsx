import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AiPracticeScreen } from './AiPracticeScreen'
import { TimeControlDialog } from './TimeControlDialog'
import { useCastle } from '../castle/useCastle'
import { loadProfile } from '../storage/profile'
import { aiPracticeState, canPractice, type AiState } from './playSetup'

export function AiPracticeRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const { identity } = useCastle()
  const state = location.state as AiState | null
  if (!state) {
    // Opened by address (a bookmark, the Corner of Babel's door) rather
    // than from the Hall. Guests who aren't signed in, or haven't earned
    // the Practice door yet, land in the Hall, which explains the lock;
    // everyone else picks the clock here and the route re-enters with
    // the state the screen needs.
    if (!identity || !canPractice(identity)) return <Navigate to="/" replace />
    return (
      <TimeControlDialog
        onCancel={() => navigate('/')}
        onConfirm={(preset) =>
          navigate('/ai', {
            replace: true,
            state: aiPracticeState(identity, loadProfile(), preset),
          })
        }
      />
    )
  }
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
