// The Great Hall — what visitors see after they step through the wicket.
//
// Phase A: host portrait + 5 doors. No chat (Phase D), no gating (Phase B),
// no Forest yet (Phase E — shown disabled "coming soon"). Doors navigate
// to the existing chess flows using the visitor's identity + profile
// defaults for clock / difficulty.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from './useCastle'
import { HostPortrait } from './HostPortrait'
import { HOSTS } from '../hosts/hosts'
import { loadProfile, pickRandomHost } from '../storage/profile'
import { presetById } from '../clock/timeControl'
import { callCreateRoom } from '../firebase/callables'
import './HallScreen.css'

const DEFAULT_OPPONENT_NAME = 'Friend'

export function HallScreen() {
  const navigate = useNavigate()
  const { identity, hostId, signOut } = useCastle()
  const profile = loadProfile()
  const host = HOSTS[hostId]
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeControl = presetById(profile.timeControlId).value
  // Identity is guaranteed by the CastleEntry route guard; this is a typing-
  // only safeguard so the rest of the component can dereference freely.
  const displayName = identity?.displayName ?? ''

  const handleOnline = async () => {
    if (creating || !identity) return
    setCreating(true)
    setError(null)
    try {
      const { roomId } = await callCreateRoom({
        displayName,
        timeControl,
      })
      navigate(`/r/${roomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleLocal = () => {
    navigate('/local', {
      state: {
        hostId: pickRandomHost(),
        whiteName: displayName,
        blackName: DEFAULT_OPPONENT_NAME,
        timeControl,
      },
    })
  }

  const handlePractice = () => {
    navigate('/ai', {
      state: {
        hostId: pickRandomHost(),
        playerName: displayName,
        difficultyId: profile.aiDifficultyId,
      },
    })
  }

  const handlePuzzles = () => navigate('/puzzles')

  if (!identity) return null

  return (
    <div className="puc-hall">
      <header className="puc-hall__header">
        <h1 className="puc-hall__title">The Great Hall</h1>
        <div className="puc-hall__header-right">
          <button type="button" className="puc-hall__link" onClick={() => navigate('/history')}>
            Match history
          </button>
          <button type="button" className="puc-hall__link" onClick={signOut}>
            Leave castle
          </button>
        </div>
      </header>

      <section className="puc-hall__hero">
        <div className="puc-hall__portrait">
          <HostPortrait hostId={hostId} variant="lobby" />
        </div>
        <div className="puc-hall__greeting">
          <h2 className="puc-hall__hostname">{host.name}</h2>
          <p className="puc-hall__welcome">
            {identity.isFirstVisit
              ? `Welcome to the Castle, ${identity.displayName}! I&#39;m so glad you came. Pick a door whenever you&#39;re ready.`
              : `Welcome back, ${identity.displayName}! Anything you want to play today?`}
          </p>
          {identity.isBypass && (
            <p className="puc-hall__bypass-note">
              You&apos;re visiting as <strong>{identity.displayName}</strong> — a guest. Your points won&apos;t be saved this time.
            </p>
          )}
          {!identity.isBypass && (
            <p className="puc-hall__points">
              Castle points: <strong>{identity.castlePoints}</strong>
            </p>
          )}
        </div>
      </section>

      <section className="puc-hall__doors">
        <h2 className="puc-hall__doors-title">Doors</h2>
        <div className="puc-hall__doors-grid">
          <button
            type="button"
            className="puc-hall__door"
            onClick={handlePuzzles}
          >
            <span className="puc-hall__door-icon" aria-hidden="true">🌱</span>
            <span className="puc-hall__door-name">Puzzle Garden</span>
            <span className="puc-hall__door-blurb">Tactical puzzles, your own pace.</span>
          </button>

          <button
            type="button"
            className="puc-hall__door puc-hall__door--disabled"
            disabled
            title="Coming soon"
          >
            <span className="puc-hall__door-icon" aria-hidden="true">🌲</span>
            <span className="puc-hall__door-name">Forest Adventure</span>
            <span className="puc-hall__door-blurb">Coming soon — dodge mushrooms, jump trees.</span>
          </button>

          <button
            type="button"
            className="puc-hall__door"
            onClick={handleOnline}
            disabled={creating}
          >
            <span className="puc-hall__door-icon" aria-hidden="true">🏰</span>
            <span className="puc-hall__door-name">{creating ? 'Opening room…' : 'Online Chess'}</span>
            <span className="puc-hall__door-blurb">Play a friend with a private link.</span>
          </button>

          <button
            type="button"
            className="puc-hall__door"
            onClick={handleLocal}
          >
            <span className="puc-hall__door-icon" aria-hidden="true">👥</span>
            <span className="puc-hall__door-name">Local Chess</span>
            <span className="puc-hall__door-blurb">Pass-and-play at one device.</span>
          </button>

          <button
            type="button"
            className="puc-hall__door"
            onClick={handlePractice}
          >
            <span className="puc-hall__door-icon" aria-hidden="true">♞</span>
            <span className="puc-hall__door-name">Practice with {host.name}</span>
            <span className="puc-hall__door-blurb">Play me — gentle AI sparring.</span>
          </button>
        </div>
        {error && <p className="puc-hall__error">{error}</p>}
      </section>
    </div>
  )
}
