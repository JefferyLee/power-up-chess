import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LocalGameScreen } from './LocalGameScreen'
import type { HostId } from '../hosts/hosts'

interface LocalState {
  hostId: HostId
  whiteName: string
  blackName: string
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
      onExit={() => navigate('/')}
    />
  )
}
