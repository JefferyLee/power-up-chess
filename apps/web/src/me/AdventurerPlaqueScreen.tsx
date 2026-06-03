// The Adventurer's Plaque — a personal-stats page that uses the shared
// PlaqueCard component. Reads from getPublicProfile against the
// signed-in user's own normalizedName so they see the same numbers
// other guests would see in the UserCard popover.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { callGetPublicProfile, type GetPublicProfileResponse } from '../firebase/callables'
import { PlaqueCard } from './PlaqueCard'
import './AdventurerPlaqueScreen.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: GetPublicProfileResponse }
  | { kind: 'error'; message: string }

export function AdventurerPlaqueScreen() {
  const { identity } = useCastle()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!identity) {
      navigate('/', { replace: true })
      return
    }
    if (identity.isBypass) {
      setState({ kind: 'error', message: 'Sign in with a magic word to see your plaque.' })
      return
    }
    callGetPublicProfile({ normalizedName: identity.normalizedName })
      .then((profile) => setState({ kind: 'ready', profile }))
      .catch((err) => setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [identity, navigate])

  return (
    <div className="puc-plaque-page">
      <button
        type="button"
        className="puc-plaque-back"
        onClick={() => navigate('/')}
        aria-label="Back to the Hall"
      >
        ← Hall
      </button>

      {state.kind === 'loading' && <div className="puc-plaque-status">Fetching your plaque…</div>}
      {state.kind === 'error' && <div className="puc-plaque-status">{state.message}</div>}
      {state.kind === 'ready' && <PlaqueCard profile={state.profile} />}
    </div>
  )
}
