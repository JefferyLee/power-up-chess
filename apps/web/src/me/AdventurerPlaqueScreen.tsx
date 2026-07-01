// The Adventurer's Plaque — a personal-stats page that uses the shared
// PlaqueCard component. Reads from getPublicProfile against the
// signed-in user's own normalizedName so they see the same numbers
// other guests would see in the UserCard popover.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { callGetPublicProfile, type GetPublicProfileResponse } from '../firebase/callables'
import { PlaqueCard } from './PlaqueCard'
import { DeleteAccountPanel } from './DeleteAccountPanel'
import './AdventurerPlaqueScreen.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; profile: GetPublicProfileResponse }
  | { kind: 'error'; message: string }

export function AdventurerPlaqueScreen() {
  const { identity } = useCastle()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  const fetchProfile = useCallback((normalizedName: string, isInitial: boolean) => {
    if (isInitial) setState({ kind: 'loading' })
    callGetPublicProfile({ normalizedName })
      .then((profile) => setState({ kind: 'ready', profile }))
      .catch((err) => {
        // Background refetches shouldn't blow away a perfectly good
        // snapshot — only surface as an error if we have nothing.
        setState((prev) => prev.kind === 'ready'
          ? prev
          : { kind: 'error', message: err instanceof Error ? err.message : String(err) },
        )
      })
  }, [])

  useEffect(() => {
    if (!identity) {
      navigate('/', { replace: true })
      return
    }
    if (identity.isBypass) {
      setState({ kind: 'error', message: 'Sign in with a magic word to see your plaque.' })
      return
    }
    fetchProfile(identity.normalizedName, true)
  }, [identity, navigate, fetchProfile])

  // Refresh on focus + on tab visibility change. Cheap (one callable
  // round-trip), and covers the common case: kid plays a game / answers
  // a quiz in another tab/app, comes back to the plaque expecting to
  // see the updated number.
  useEffect(() => {
    if (!identity || identity.isBypass) return
    const refresh = () => fetchProfile(identity.normalizedName, false)
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [identity, fetchProfile])

  // Live-subscribe to the user's own guest doc so equipment changes
  // (made on /shop without leaving the SPA) propagate to the plaque
  // immediately — focus/visibility refetch doesn't fire on intra-app
  // navigation. We only patch the small set of fields that actually
  // update live; aggregate stats keep coming from the callable.
  useEffect(() => {
    if (!identity || identity.isBypass) return
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as
        | { cosmetics?: { pieceSet?: string }; castlePoints?: number }
        | undefined
      if (!data) return
      setState((prev) => {
        if (prev.kind !== 'ready') return prev
        // Same 'classic' default the server returns — keeps the field
        // non-nullable so <Piece pieceSetIdOverride> never falls
        // through to the viewer's cosmetic (see PlaqueCard).
        const nextEquipped = data.cosmetics?.pieceSet ?? 'classic'
        const nextPoints = typeof data.castlePoints === 'number'
          ? data.castlePoints
          : prev.profile.castlePoints
        if (
          nextEquipped === prev.profile.equippedPieceSet &&
          nextPoints === prev.profile.castlePoints
        ) return prev
        return {
          kind: 'ready',
          profile: {
            ...prev.profile,
            equippedPieceSet: nextEquipped,
            castlePoints: nextPoints,
          },
        }
      })
    })
    return () => unsub()
  }, [identity])

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
      {state.kind === 'ready' && <DeleteAccountPanel />}
    </div>
  )
}
