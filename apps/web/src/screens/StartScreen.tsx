import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HOSTS, type HostId } from '../hosts/hosts'
import { useAuthUid } from '../auth/useAuthUid'
import { callCreateRoom } from '../firebase/callables'
import { loadProfile, saveProfile } from '../storage/profile'
import './StartScreen.css'

export function StartScreen() {
  const navigate = useNavigate()
  const initial = loadProfile()
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [hostId, setHostId] = useState<HostId>(initial.hostId)
  const [opponentName, setOpponentName] = useState('Friend')
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const authState = useAuthUid()

  const canStartLocal = displayName.trim().length > 0 && opponentName.trim().length > 0
  const canCreate = authState.status === 'ready' && displayName.trim().length > 0 && !creating
  const canJoin = /^[A-Za-z0-9]{4,12}$/.test(joinCode.trim())

  const persist = () => saveProfile({ displayName: displayName.trim(), hostId })

  const onStartLocal = () => {
    persist()
    navigate('/local', {
      state: { hostId, whiteName: displayName.trim(), blackName: opponentName.trim() },
    })
  }

  const onCreateRoom = async () => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      persist()
      const { roomId } = await callCreateRoom({ displayName: displayName.trim(), hostMode: hostId })
      navigate(`/r/${roomId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setCreating(false)
    }
  }

  const onJoinRoom = () => {
    if (!canJoin) return
    persist()
    navigate(`/r/${joinCode.trim()}`)
  }

  return (
    <div className="puc-start">
      <div className="puc-start__inner">
        <header className="puc-start__hero">
          <h1 className="puc-start__title">Power Up Chess</h1>
          <p className="puc-start__subtitle">A brave little forest, a real chess board, and a host who is glad you came.</p>
        </header>

        <section className="puc-start__panel" aria-labelledby="puc-start-name">
          <h2 id="puc-start-name" className="puc-start__panel-title">Your name</h2>
          <input
            className="puc-start__big-input"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={24}
            autoComplete="off"
            aria-label="Your display name"
          />
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-host">
          <h2 id="puc-start-host" className="puc-start__panel-title">Pick a host</h2>
          <div className="puc-start__hosts">
            {Object.values(HOSTS).map((h) => (
              <button
                key={h.id}
                type="button"
                className={`puc-start__host ${hostId === h.id ? 'puc-start__host--selected' : ''}`}
                onClick={() => setHostId(h.id)}
                aria-pressed={hostId === h.id}
              >
                <span className="puc-start__host-name">{h.name}</span>
                <span className="puc-start__host-blurb">{h.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-online">
          <h2 id="puc-start-online" className="puc-start__panel-title">Play online</h2>
          <div className="puc-start__online">
            <button
              type="button"
              className="puc-start__cta"
              onClick={onCreateRoom}
              disabled={!canCreate}
            >
              {creating ? 'Creating room…' : 'Create private room'}
            </button>
            <div className="puc-start__join">
              <input
                className="puc-start__code-input"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Or paste a room code"
                aria-label="Room code"
                maxLength={12}
              />
              <button
                type="button"
                className="puc-start__cta puc-start__cta--ghost"
                onClick={onJoinRoom}
                disabled={!canJoin}
              >
                Join
              </button>
            </div>
            {error && <p className="puc-start__error">{error}</p>}
          </div>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-local">
          <h2 id="puc-start-local" className="puc-start__panel-title">Play local</h2>
          <label className="puc-start__player">
            <span className="puc-start__player-label">Opponent name</span>
            <input
              type="text"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              maxLength={24}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            className="puc-start__cta puc-start__cta--ghost"
            disabled={!canStartLocal}
            onClick={onStartLocal}
          >
            Start local game
          </button>
        </section>

        <p className="puc-start__auth" aria-live="polite">
          {authState.status === 'loading' && 'Signing you in…'}
          {authState.status === 'ready' && `Signed in · ${authState.uid.slice(0, 8)}`}
          {authState.status === 'error' && `Auth error: ${authState.error.message}`}
        </p>
      </div>
    </div>
  )
}
