// Wizard's Duel routes.
//
// /wizard            — creates a new room with the current guest as white,
//                       then redirects to /wizard/:roomId
// /wizard/:roomId    — subscribes to the room. If the caller isn't already
//                       a player, auto-joins as black.

import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import { useCosmetics } from '../../cosmetics/useCosmetics'
import { useAuthUid } from '../../auth/useAuthUid'
import { callCreateWizardRoom, callJoinWizardRoom } from '../../firebase/callables'
import { useWizardRoom } from './useWizardRoom'
import { WizardRoomScreen } from './WizardRoomScreen'

export function WizardDuelRoute() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const cosmetics = useCosmetics()
  const auth = useAuthUid()
  const [error, setError] = useState<string | null>(null)
  const creatingRef = useRef(false)

  useEffect(() => {
    if (!identity || auth.status !== 'ready' || creatingRef.current) return
    creatingRef.current = true
    void (async () => {
      try {
        const { roomId } = await callCreateWizardRoom({
          displayName: identity.displayName,
          normalizedName: identity.normalizedName,
          isBypass: identity.isBypass,
          pieceSetId: cosmetics.pieceSetId,
        })
        // Carry the acknowledgement forward — the opener already passed
        // the warning gate at /wizard, so the room route shouldn't warn
        // them again.
        navigate(`/wizard/${roomId}`, { replace: true, state: { wizardWarned: true } })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        creatingRef.current = false
      }
    })()
  }, [identity, auth.status, navigate, cosmetics.pieceSetId])

  if (!identity) return <Navigate to="/" replace />

  return (
    <div className="puc-wd-loading">
      <p>Opening a duel room…</p>
      {error && <p style={{ color: '#f6a4a4' }}>{error}</p>}
    </div>
  )
}

export function WizardRoomRoute() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { identity } = useCastle()
  const cosmetics = useCosmetics()
  const auth = useAuthUid()
  const { state, retry } = useWizardRoom(roomId ?? null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const joinedRef = useRef(false)

  // If we're not a player and the room exists, try to join as black.
  useEffect(() => {
    if (state.status !== 'ready' && state.status !== 'forbidden') return
    if (auth.status !== 'ready' || !identity || !roomId) return
    if (joinedRef.current) return
    if (state.status === 'ready') {
      const uid = auth.uid
      const isPlayer = state.room.white.uid === uid || state.room.black?.uid === uid
      if (isPlayer) return
      if (state.room.status !== 'waiting') return
    }
    joinedRef.current = true
    void (async () => {
      try {
        await callJoinWizardRoom({
          roomId,
          displayName: identity.displayName,
          normalizedName: identity.normalizedName,
          isBypass: identity.isBypass,
          pieceSetId: cosmetics.pieceSetId,
        })
        retry()
      } catch (e) {
        setJoinError(e instanceof Error ? e.message : String(e))
        joinedRef.current = false
      }
    })()
  }, [state, auth, identity, roomId, retry])

  if (!identity) return <Navigate to="/" replace />
  if (!roomId) return <Navigate to="/wizard" replace />

  if (state.status === 'loading') {
    return <div className="puc-wd-loading"><p>Loading the duel…</p></div>
  }
  if (state.status === 'not_found') {
    return (
      <div className="puc-wd-loading">
        <p>That duel room wasn&apos;t found.</p>
        <button onClick={() => navigate('/')}>Back to the Hall</button>
      </div>
    )
  }
  if (state.status === 'forbidden') {
    return (
      <div className="puc-wd-loading">
        <p>Joining the duel…</p>
        {joinError && <p style={{ color: '#f6a4a4' }}>{joinError}</p>}
      </div>
    )
  }
  if (state.status === 'error') {
    return <div className="puc-wd-loading"><p>Couldn&apos;t load the room: {state.error.message}</p></div>
  }

  return (
    <WizardRoomScreen
      roomId={roomId}
      room={state.room}
      onExit={() => navigate('/')}
    />
  )
}
