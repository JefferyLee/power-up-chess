import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LocalGameScreen } from './LocalGameScreen'
import { TimeControlDialog } from './TimeControlDialog'
import { useCastle } from '../castle/useCastle'
import { localGameState, type LocalState } from './playSetup'

export function LocalGameRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const { identity } = useCastle()
  const state = location.state as LocalState | null
  if (!state) {
    // Opened by address (a bookmark, the Corner of Babel's door) rather
    // than from the Hall. The gate signs guests in; the clock is picked
    // here, then the route re-enters with the state the screen needs.
    if (!identity) return <Navigate to="/" replace />
    return (
      <TimeControlDialog
        onCancel={() => navigate('/')}
        onConfirm={(preset) =>
          navigate('/local', { replace: true, state: localGameState(identity, preset) })
        }
      />
    )
  }
  return (
    <LocalGameScreen
      hostId={state.hostId}
      coHostId={state.coHostId}
      whiteName={state.whiteName}
      blackName={state.blackName}
      timeControl={state.timeControl ?? null}
      onExit={() => navigate('/')}
    />
  )
}
