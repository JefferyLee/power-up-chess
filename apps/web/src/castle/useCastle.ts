// useCastle hook — split out so the provider file only exports a component
// (keeps react-refresh happy).

import { useContext } from 'react'
import { CastleContext, type CastleContextValue } from './castleContext'

export function useCastle(): CastleContextValue {
  const ctx = useContext(CastleContext)
  if (!ctx) throw new Error('useCastle must be used inside <CastleIdentityProvider>')
  return ctx
}
