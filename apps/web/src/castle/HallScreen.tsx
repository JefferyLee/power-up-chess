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
import { StoryRequestButton } from './StoryRequestButton'
import { HOSTS } from '../hosts/hosts'
import { loadProfile, pickRandomHost } from '../storage/profile'
import { callCreateRoom } from '../firebase/callables'
import { ChatPanel } from './ChatPanel'
import { OnlineList } from './OnlineList'
import { VisitorCard } from './VisitorCard'
import { RoomDoor } from './RoomDoor'
import { HallAmbient } from './HallAmbient'
import { WizardWarningDialog } from '../games/wizard/WizardWarningDialog'
import { TimeControlDialog } from '../screens/TimeControlDialog'
import type { TimeControlPreset } from '../clock/timeControl'
import { FeedbackButton } from './FeedbackButton'
import { FeedbackInbox } from './FeedbackInbox'
import { useAuthUid } from '../auth/useAuthUid'
import { usePublicStats } from './usePublicStats'
import './HallScreen.css'

const DEFAULT_OPPONENT_NAME = 'Friend'
const UNLOCK_THRESHOLD = 200

export function HallScreen() {
  const navigate = useNavigate()
  const { identity, hostId, signOut, clearDecayInfo, clearBonusInfo } = useCastle()
  const profile = loadProfile()
  const host = HOSTS[hostId]
  const auth = useAuthUid()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [decayMessage] = useState(() => {
    const d = identity?.lastDecay
    if (!d || d.decayedBy <= 0) return null
    const reLockedHint = identity && identity.castlePoints < UNLOCK_THRESHOLD && d.pointsBefore >= UNLOCK_THRESHOLD
      ? ' Solve a few puzzles to earn them back!'
      : ''
    return `Things got dusty while you were away — your castle points went from ${d.pointsBefore} to ${identity?.castlePoints ?? 0}.${reLockedHint}`
  })
  const [bonusMessage] = useState(() => {
    const b = identity?.lastBonus
    if (!b || b.total <= 0) return null
    const parts: string[] = []
    if (b.starter) parts.push(`🎁 Welcome gift +${b.starter}`)
    if (b.checkIn) parts.push(`☀️ Daily check-in +${b.checkIn}`)
    if (b.streak) parts.push(`🔥 ${b.streakDays}-day streak +${b.streak}`)
    return parts.length > 0
      ? `${parts.join(' · ')} (+${b.total} castle points total)`
      : null
  })
  useEffect(() => {
    if (identity?.lastDecay) clearDecayInfo()
    if (identity?.lastBonus) clearBonusInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displayName = identity?.displayName ?? ''
  const castlePoints = identity?.castlePoints ?? 0
  const isUnlocked = castlePoints >= UNLOCK_THRESHOLD && !(identity?.isBypass ?? false)
  const publicStats = usePublicStats()
  // Default to 1000 if the stats doc hasn't loaded — matches the server
  // fallback in createWizardRoom / joinWizardRoom.
  const wizardGate =
    publicStats.status === 'ready' &&
    typeof publicStats.stats.wizardGateMinPoints === 'number'
      ? publicStats.stats.wizardGateMinPoints
      : 1000
  const isWizardUnlocked =
    !(identity?.isBypass ?? false) && castlePoints >= wizardGate

  type TcTarget = 'online' | 'local' | 'practice'
  const [tcTarget, setTcTarget] = useState<TcTarget | null>(null)
  const openTcDialog = (target: TcTarget) => {
    if (creating || !identity) return
    setTcTarget(target)
  }
  const handleOnline = () => openTcDialog('online')
  const handleConfirmTimeControl = async (preset: TimeControlPreset) => {
    if (!identity || tcTarget === null) return
    if (tcTarget === 'local') {
      setTcTarget(null)
      navigate('/local', {
        state: {
          hostId: pickRandomHost(),
          whiteName: displayName,
          blackName: DEFAULT_OPPONENT_NAME,
          timeControl: preset.value,
        },
      })
      return
    }
    if (tcTarget === 'practice') {
      setTcTarget(null)
      navigate('/ai', {
        state: {
          hostId: pickRandomHost(),
          playerName: displayName,
          difficultyId: profile.aiDifficultyId,
          timeControl: preset.value,
        },
      })
      return
    }
    // tcTarget === 'online'
    setCreating(true)
    setError(null)
    try {
      const { roomId } = await callCreateRoom({
        displayName,
        normalizedName: identity.normalizedName,
        isBypass: identity.isBypass,
        timeControl: preset.value,
      })
      setTcTarget(null)
      navigate(`/r/${roomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleLocal = () => openTcDialog('local')
  const handlePractice = () => openTcDialog('practice')

  const handlePuzzles = () => navigate('/puzzles')
  const handleForest = () => navigate('/forest')
  const [wizardWarnOpen, setWizardWarnOpen] = useState(false)
  const handleWizard = () => setWizardWarnOpen(true)

  if (!identity) return null

  const lockedTitle = `Earn ${UNLOCK_THRESHOLD} castle points first`

  return (
    <div className="puc-hall">
      <HallAmbient />
      <header className="puc-hall__header">
        <h1 className="puc-hall__title">The Great Hall</h1>
        <div className="puc-hall__header-right">
          <FeedbackInbox />
          <button type="button" className="puc-hall__link" onClick={() => navigate('/history')}>
            Match history
          </button>
          <button type="button" className="puc-hall__link" onClick={signOut}>
            Leave castle
          </button>
        </div>
      </header>

      {/* Learning + serious chess — above the chat. Hero CTA so a new
       *  visitor sees the path to learning + playing before the social
       *  layer pulls focus. */}
      <section className="puc-hall__doors puc-hall__doors--learn">
        <h2 className="puc-hall__doors-title">Learn and play chess</h2>
        <div className="puc-hall__doors-grid puc-hall__doors-grid--five">
          <RoomDoor
            icon="📖"
            label="Learn chess"
            blurb="Five short lessons. Start here if you're new."
            variant="mossy"
            onClick={() => navigate('/learn')}
          />
          <RoomDoor
            icon="🌱"
            label="Puzzle Garden"
            blurb="Tactical puzzles, your own pace."
            variant="mossy"
            onClick={handlePuzzles}
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

      {/* Social row below the doors — host on the left, chat in the
       *  middle (the most vertical real-estate), passive info on the
       *  right. */}
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
            {bonusMessage && <p className="puc-hall__bonus-note">{bonusMessage}</p>}
            {decayMessage && <p className="puc-hall__decay-note">{decayMessage}</p>}
            <StoryRequestButton hostId={hostId} hostName={host.name} enabled={auth.status === 'ready'} />
            <FeedbackButton />
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

      {/* Leisure / fun rooms — below the chat. Side games, the future
       *  shop, and any new casual modes land here so the serious chess
       *  doors above stay the page's primary CTA. */}
      <section className="puc-hall__doors puc-hall__doors--fun">
        <h2 className="puc-hall__doors-title">Take a break</h2>
        <div className="puc-hall__doors-grid puc-hall__doors-grid--fun">
          <RoomDoor
            icon="🌲"
            label="Forest Adventure"
            blurb="Dodge red, collect gold, jump trees."
            variant="forest"
            onClick={handleForest}
          />
          <RoomDoor
            icon="✨"
            label="Wizard's Duel"
            blurb={
              isWizardUnlocked
                ? 'Chess with magic spells — for fun, not for chess practice.'
                : `Locked — needs ${wizardGate} castle points.`
            }
            variant="starry"
            locked={!isWizardUnlocked}
            onClick={handleWizard}
            disabled={!isWizardUnlocked}
            title={
              isWizardUnlocked
                ? undefined
                : `Earn ${wizardGate} castle points to unlock Wizard's Duel.`
            }
          />
          <RoomDoor
            icon="🎨"
            label="Theme Shop"
            blurb="Pick the look of your chess pieces. New sets unlock soon."
            variant="parchment"
            onClick={() => navigate('/shop')}
          />
          <RoomDoor
            icon="📚"
            label="Story Library"
            blurb="108 chess stories — read with Lucy or Luca."
            variant="parchment"
            onClick={() => navigate('/library')}
          />
        </div>
      </section>

      {wizardWarnOpen && (
        <WizardWarningDialog
          onCancel={() => setWizardWarnOpen(false)}
          onConfirm={() => { setWizardWarnOpen(false); navigate('/wizard') }}
        />
      )}

      {tcTarget !== null && (
        <TimeControlDialog
          busy={creating}
          onCancel={() => setTcTarget(null)}
          onConfirm={handleConfirmTimeControl}
        />
      )}
    </div>
  )
}
