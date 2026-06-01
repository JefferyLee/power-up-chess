import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LocalGameScreen } from './LocalGameScreen'
import type { HostId } from '../hosts/hosts'
import type { TimeControl } from '../clock/timeControl'

interface LocalState {
  hostId: HostId
  whiteName: string
  blackName: string
  timeControl?: TimeControl | null
}

export function LocalGameRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocalState | null
  if (!state) return <Navigate to="/" replace />
  return (
    <LocalGameScreen
      hostId={state.hostId}
      whiteName={state.whiteName}
      blackName={state.blackName}
      timeControl={state.timeControl ?? null}
      onExit={() => navigate('/')}
    />
  )
}
