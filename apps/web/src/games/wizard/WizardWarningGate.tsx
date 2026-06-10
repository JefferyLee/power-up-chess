// WizardWarningGate — wraps every Wizard's Duel route so the "magical
// warning" board appears before the duel is shown, on EVERY entry
// path: opening your own room, accepting an invite, or spectating.
//
// The only way past it is the "I understand" button. A navigation that
// has already shown the warning (the room-create flow, which warns at
// /wizard before spending castle points) passes
// `state: { wizardWarned: true }` so the opener isn't warned twice.

import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { WizardWarningDialog } from './WizardWarningDialog'

export function WizardWarningGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [acknowledged, setAcknowledged] = useState(
    () => (location.state as { wizardWarned?: boolean } | null)?.wizardWarned === true,
  )

  if (!acknowledged) {
    return (
      <WizardWarningDialog
        onConfirm={() => setAcknowledged(true)}
        onCancel={() => navigate('/')}
      />
    )
  }
  return <>{children}</>
}
