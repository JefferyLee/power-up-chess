// The Great Hall — what visitors see after they step through the wicket.
//
// Layout (Phase F): top row = host portrait + greeting (left) + chat panel
// (center, takes most of the room). Right column has the VisitorCard
// (avatar + name + castle points) and the OnlineList. Below: a row of
// arched-top door tiles for the chess rooms + puzzles + forest.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from './useCastle'
import { HostPortrait } from './HostPortrait'
import { HOSTS } from '../hosts/hosts'
import { loadProfile, pickRandomHost } from '../storage/profile'
import { presetById } from '../clock/timeControl'
import { callCreateRoom } from '../firebase/callables'
import { ChatPanel } from './ChatPanel'
import { OnlineList } from './OnlineList'
import { VisitorCard } from './VisitorCard'
import { RoomDoor } from './RoomDoor'
import { usePresenceHeartbeat } from './usePresenceHeartbeat'
import { useAuthUid } from '../auth/useAuthUid'
import './HallScreen.css'

const DEFAULT_OPPONENT_NAME = 'Friend'
const UNLOCK_THRESHOLD = 200

export function HallScreen() {
  const navigate = useNavigate()
  const { identity, hostId, signOut, clearDecayInfo } = useCastle()
  const profile = loadProfile()
  const host = HOSTS[hostId]
  const auth = useAuthUid()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  usePresenceHeartbeat()
  const [decayMessage] = useState(() => {
    const d = identity?.lastDecay
    if (!d || d.decayedBy <= 0) return null
    const reLockedHint = identity && identity.castlePoints < UNLOCK_THRESHOLD && d.pointsBefore >= UNLOCK_THRESHOLD
      ? ' Solve a few puzzles to earn them back!'
      : ''
    return `Things got dusty while you were away — your castle points went from ${d.pointsBefore} to ${identity?.castlePoints ?? 0}.${reLockedHint}`
  })
  useEffect(() => {
    if (identity?.lastDecay) clearDecayInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const timeControl = presetById(profile.timeControlId).value
  const displayName = identity?.displayName ?? ''
  const castlePoints = identity?.castlePoints ?? 0
  const isUnlocked = castlePoints >= UNLOCK_THRESHOLD && !(identity?.isBypass ?? false)

  const handleOnline = async () => {
    if (creating || !identity) return
    setCreating(true)
    setError(null)
    try {
      const { roomId } = await callCreateRoom({ displayName, timeControl })
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
  const handleForest = () => navigate('/forest')

  if (!identity) return null

  const lockedTitle = `Earn ${UNLOCK_THRESHOLD} castle points first`

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

      <section className="puc-hall__top">
        <aside className="puc-hall__host">
          <div className="puc-hall__portrait">
            <HostPortrait hostId={hostId} variant="lobby" />
          </div>
          <div className="puc-hall__greeting">
            <h2 className="puc-hall__hostname">{host.name}</h2>
            <p className="puc-hall__welcome">
              {identity.isFirstVisit
                ? `Welcome to the Castle, ${identity.displayName}! I'm so glad you came.`
                : `Welcome back, ${identity.displayName}!`}
            </p>
            {decayMessage && <p className="puc-hall__decay-note">{decayMessage}</p>}
          </div>
        </aside>

        <div className="puc-hall__chatcol">
          <ChatPanel canChat={auth.status === 'ready'} />
        </div>

        <div className="puc-hall__sidecol">
          <VisitorCard />
          <OnlineList youUid={auth.status === 'ready' ? auth.uid : null} />
        </div>
      </section>

      <section className="puc-hall__doors">
        <h2 className="puc-hall__doors-title">Choose a room</h2>
        <div className="puc-hall__doors-grid">
          <RoomDoor
            icon="🌱"
            label="Puzzle Garden"
            blurb="Tactical puzzles, your own pace."
            variant="mossy"
            onClick={handlePuzzles}
          />
          <RoomDoor
            icon="🌲"
            label="Forest Adventure"
            blurb="Dodge red, collect gold, jump trees."
            variant="forest"
            onClick={handleForest}
          />
          <RoomDoor
            icon="🏰"
            label={creating ? 'Opening…' : 'Online Chess'}
            blurb={isUnlocked ? 'Play a friend with a private link.' : `Locked — needs ${UNLOCK_THRESHOLD} points.`}
            variant="oak"
            locked={!isUnlocked}
            loading={creating}
            onClick={handleOnline}
            disabled={creating || !isUnlocked}
            title={!isUnlocked ? lockedTitle : undefined}
          />
          <RoomDoor
            icon="👥"
            label="Local Chess"
            blurb={isUnlocked ? 'Pass-and-play at one device.' : `Locked — needs ${UNLOCK_THRESHOLD} points.`}
            variant="oak"
            locked={!isUnlocked}
            onClick={handleLocal}
            disabled={!isUnlocked}
            title={!isUnlocked ? lockedTitle : undefined}
          />
          <RoomDoor
            icon="♞"
            label={`Practice with ${host.name}`}
            blurb={isUnlocked ? 'Gentle AI sparring.' : `Locked — needs ${UNLOCK_THRESHOLD} points.`}
            variant={hostId === 'lucy' ? 'mossy' : 'starry'}
            locked={!isUnlocked}
            onClick={handlePractice}
            disabled={!isUnlocked}
            title={!isUnlocked ? lockedTitle : undefined}
          />
        </div>
        {error && <p className="puc-hall__error">{error}</p>}
      </section>
    </div>
  )
}
