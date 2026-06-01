// Wizard's Duel route — wraps the screen, sources player names from the
// castle identity (white) and a default opponent name (black). Local-only
// in V1 so the opponent name is just a placeholder.

import { Navigate, useNavigate } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import { WizardDuelScreen } from './WizardDuelScreen'

export function WizardDuelRoute() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  if (!identity) return <Navigate to="/" replace />
  return (
    <WizardDuelScreen
      onExit={() => navigate('/')}
      whiteName={identity.displayName}
      blackName="Friend"
    />
  )
}
