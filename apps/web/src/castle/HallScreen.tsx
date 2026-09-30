// The Great Hall — what visitors see after they step through the wicket.
//
// Layout (Phase F): top row = host portrait + greeting (left) + chat panel
// (center, takes most of the room). Right column has the VisitorCard
// (avatar + name + castle points) and the OnlineList. Below: a row of
// arched-top door tiles for the chess rooms + puzzles + forest.

import { useEffect, useState, type ComponentProps } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from './useCastle'
import { useCosmetics } from '../cosmetics/useCosmetics'
import { type DailyStripState } from '../puzzles/DailyStrip'
import { FirstVisitGuide, TodaysPractice } from './TodaysPractice'
import { MuteButton } from '../sound/MuteButton'
import { HostFigure } from './HostFigure'
import { useIsNarrow } from './useIsNarrow'
import { ChatSheet } from './ChatSheet'
import { HearthTicker } from './HearthTicker'
import { StoryRequestButton } from './StoryRequestButton'
import { HOSTS } from '../hosts/hosts'
import { loadProfile, pickRandomHost } from '../storage/profile'
import { callCreateRoom } from '../firebase/callables'
import { ChatPanel } from './ChatPanel'
import { OnlineList } from './OnlineList'
import { VisitorCard } from './VisitorCard'
import { RoomDoor } from './RoomDoor'
import { HallAmbient } from './HallAmbient'
import { RecentlyPlayedList } from './RecentlyPlayedList'
import { FindPlayer } from './FindPlayer'
import { MyTeamsList } from '../teams/MyTeamsList'
import { CurrentStoryPanel } from './CurrentStoryPanel'
import { ChampionBanner } from '../tournament/ChampionBanner'
import { useWaitingRooms, formatRoomCount } from './useWaitingRooms'
import { RoomChooserDialog } from './RoomChooserDialog'
import { TimeControlDialog } from '../screens/TimeControlDialog'
import type { TimeControlPreset } from '../clock/timeControl'
import { FeedbackButton } from './FeedbackButton'
import { HostInviteButton } from '../invitations/HostInviteButton'
import { FeedbackInbox } from './FeedbackInbox'
import { useAuthUid } from '../auth/useAuthUid'
import { usePublicStats } from './usePublicStats'
import { useSound } from '../sound/useSound'
import { DOOR_ROUTES, PLAY_GATE_POINTS, WIZARD_GATE_DEFAULT, type DoorDef, type DoorSection } from '../routes'
import './HallScreen.css'

import { friendlyError } from '../errors/friendlyError'
const DEFAULT_OPPONENT_NAME = 'Friend'
const UNLOCK_THRESHOLD = PLAY_GATE_POINTS

export function HallScreen() {
  const navigate = useNavigate()
  const { identity, hostId, signOut, clearDecayInfo, clearBonusInfo } = useCastle()
  // Hearth-fire crackle while in the Hall — synthesized ambient bed, no
  // asset file. Browsers gate audio start on the first user interaction.
  const sound = useSound()
  useEffect(() => {
    sound.startAmbient('fire-crackle')
    return () => sound.stopAmbient()
  }, [sound])
  const cosmetics = useCosmetics()
  const profile = loadProfile()
  const host = HOSTS[hostId]
  // Live-subscribe to puzzleDaily so the strip stays current as the kid
  // solves puzzles in /puzzles/daily. Bypass guests don't have a doc —
  // we just render an empty (five-pending) strip.
  const [puzzleDaily, setPuzzleDaily] = useState<DailyStripState | null>(null)
  useEffect(() => {
    if (!identity || identity.isBypass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPuzzleDaily(null)
      return
    }
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as { puzzleDaily?: DailyStripState } | undefined
      setPuzzleDaily(data?.puzzleDaily ?? null)
    })
    return () => unsub()
  }, [identity])
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
      : WIZARD_GATE_DEFAULT
  const isWizardUnlocked =
    !(identity?.isBypass ?? false) && castlePoints >= wizardGate

  type TcTarget = 'online' | 'local' | 'practice'
  const [tcTarget, setTcTarget] = useState<TcTarget | null>(null)
  const openTcDialog = (target: TcTarget) => {
    if (creating || !identity) return
    setTcTarget(target)
  }
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
        pieceSetId: cosmetics.pieceSetId,
      })
      setTcTarget(null)
      navigate(`/r/${roomId}`)
    } catch (e) {
      setError(friendlyError(e, 'opening a room'))
    } finally {
      setCreating(false)
    }
  }

  const handleLocal = () => openTcDialog('local')
  const handlePractice = () => openTcDialog('practice')

  // Door chooser: when the kid taps Online Chess or Wizard's Duel,
  // show the list of currently-open rooms first. They can join one,
  // or open a new room (which kicks off the original flow).
  const waiting = useWaitingRooms()
  const [chooserKind, setChooserKind] = useState<null | 'chess' | 'wizard'>(null)
  // On phone widths the chat opens as a bottom sheet; on desktop the
  // floating bubble scrolls to the hearth section at the page bottom.
  const isNarrow = useIsNarrow(880)
  const [chatSheetOpen, setChatSheetOpen] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const handleOnlineDoor = () => {
    if (creating || !isUnlocked) return
    setChooserKind('chess')
  }
  const handleWizardDoor = () => {
    if (!isWizardUnlocked) return
    setChooserKind('wizard')
  }
  // Opening a new room from the chooser hands control to the existing
  // open-room flows. Chess shows the time-control dialog; Wizard's Duel
  // navigates to /wizard, where the WizardWarningGate shows the magical
  // warning before the room is created (and before any points are spent).
  const handleChooserOpenNew = (kind: 'chess' | 'wizard') => {
    if (kind === 'chess') openTcDialog('online')
    else navigate('/wizard')
  }

  if (!identity) return null

  const lockedTitle = `Earn ${UNLOCK_THRESHOLD} castle points first`
  // 2.5 — "how far away am I" in kid units: Daily Five pays +10 on completion.
  const pointsToGo = Math.max(0, UNLOCK_THRESHOLD - castlePoints)
  const dailiesToGo = Math.max(1, Math.ceil(pointsToGo / 10))
  const lockedBlurb = `Locked — ${pointsToGo} points to go (about ${dailiesToGo} Daily Five${dailiesToGo === 1 ? '' : 's'}).`

  // Door tiles come from the route registry (src/routes.tsx). The four
  // stateful doors — gates, dialogs, waiting-room badges — layer their
  // live props on top of the registry copy.
  const liveDoorProps = (door: DoorDef): Partial<ComponentProps<typeof RoomDoor>> => {
    switch (door.iconKey) {
      case 'online':
        return {
          label: creating ? 'Opening…' : door.label,
          blurb: isUnlocked ? door.blurb : lockedBlurb,
          locked: !isUnlocked,
          loading: creating,
          onClick: handleOnlineDoor,
          disabled: creating || !isUnlocked,
          title: !isUnlocked ? lockedTitle : undefined,
          badge: waiting.chess.length > 0 ? formatRoomCount(waiting.chess.length) : undefined,
          badgeTitle:
            waiting.chess.length > 0
              ? `${waiting.chess.length} chess room${waiting.chess.length === 1 ? '' : 's'} waiting`
              : undefined,
        }
      case 'local':
        return { onClick: handleLocal }
      case 'practice-ai':
        return {
          label: door.label.replace('{host}', host.name),
          blurb: isUnlocked ? door.blurb : lockedBlurb,
          variant: hostId === 'lucy' ? 'mossy' : 'starry',
          locked: !isUnlocked,
          onClick: handlePractice,
          disabled: !isUnlocked,
          title: !isUnlocked ? lockedTitle : undefined,
        }
      case 'wizard':
        return {
          blurb: isWizardUnlocked ? door.blurb : `Locked — needs ${wizardGate} castle points.`,
          locked: !isWizardUnlocked,
          onClick: handleWizardDoor,
          disabled: !isWizardUnlocked,
          title: isWizardUnlocked
            ? undefined
            : `Earn ${wizardGate} castle points to unlock Wizard's Duel.`,
          badge: waiting.wizard.length > 0 ? formatRoomCount(waiting.wizard.length) : undefined,
          badgeTitle:
            waiting.wizard.length > 0
              ? `${waiting.wizard.length} duel${waiting.wizard.length === 1 ? '' : 's'} waiting`
              : undefined,
        }
      default:
        return {}
    }
  }
  const doorsIn = (section: DoorSection) =>
    DOOR_ROUTES.filter((r) => r.door.section === section).map((r) => (
      <RoomDoor
        key={r.door.iconKey}
        icon={r.door.icon}
        iconKey={r.door.iconKey}
        label={r.door.label}
        blurb={r.door.blurb}
        variant={r.door.variant}
        companionImg={r.door.companionImg}
        onClick={() => navigate(r.path)}
        {...liveDoorProps(r.door)}
      />
    ))

  return (
    <div className="puc-hall">
      <HallAmbient />
      <header className="puc-hall__header">
        <h1 className="puc-hall__title">The Great Hall</h1>
        <div className="puc-hall__header-right">
          <MuteButton />
          <FeedbackInbox />
          <button
            type="button"
            className="puc-hall__leave"
            onClick={signOut}
            title="Leave the castle"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Open door + outward arrow. */}
              <path d="M13 4 H6 a1 1 0 0 0 -1 1 v14 a1 1 0 0 0 1 1 h7" />
              <path d="M16 8 l4 4 -4 4" />
              <path d="M20 12 H10" />
            </svg>
            <span>Leave castle</span>
          </button>
        </div>
      </header>

      <div className="puc-hall__layout">
      {/* ── LEFT RAIL: host card (sticky figure) + social + nav ── */}
      <aside className="puc-hall__rail">
        <section className="puc-hall__hostcard">
          <div className="puc-hall__hostfig-wrap">
            <HostFigure hostId={hostId} />
          </div>
          <div className="puc-hall__hostbody">
            <h2 className="puc-hall__hostname">{host.name}</h2>
            <p className="puc-hall__welcome">
              {identity.isFirstVisit
                ? `Welcome to the Castle, ${identity.displayName}! I'm so glad you came.`
                : `Welcome back, ${identity.displayName}!`}
            </p>
            {bonusMessage && <p className="puc-hall__bonus-note">{bonusMessage}</p>}
            {decayMessage && <p className="puc-hall__decay-note">{decayMessage}</p>}
            <CurrentStoryPanel
              currentHostId={hostId}
              defaultCollapsed
            />
          </div>
          {/* Buttons span the full card width below the figure+text
           *  row so each fits on one line instead of wrapping inside
           *  the narrow text column. */}
          <div className="puc-hall__hostbtns">
            <StoryRequestButton hostId={hostId} hostName={host.name} enabled={auth.status === 'ready'} />
            <HostInviteButton hostId={hostId} />
            <FeedbackButton />
          </div>
        </section>

        <div className="puc-hall__social">
          <OnlineList youUid={auth.status === 'ready' ? auth.uid : null} />
          <FindPlayer />
          {/* The player's own corner — identity, balance, page links,
           *  teams and recent opponents merged into ONE card. */}
          <section className="puc-hall__playercard">
            <VisitorCard />
            <MyTeamsList />
            <RecentlyPlayedList />
          </section>
        </div>
      </aside>

      {/* ── RIGHT MAIN: daily strip / hearth ticker / door corridor ── */}
      <main className="puc-hall__main">
      {!identity.isBypass && (
        <>
          <FirstVisitGuide isFirstVisit={identity.isFirstVisit} hostName={host.name} />
          <TodaysPractice
            hostName={host.name}
            aiUnlocked={isUnlocked}
            pointsToUnlock={Math.max(0, UNLOCK_THRESHOLD - castlePoints)}
            puzzleDaily={puzzleDaily}
            onPractice={handlePractice}
            onOpenDaily={() => navigate('/puzzles/daily')}
          />
        </>
      )}

      {/* The Hearth — collapsed ticker by default (latest few chat
       *  lines); expanding swaps in the full ChatPanel in place and
       *  pushes the doors down. Phones open the bottom sheet instead
       *  of expanding inline. */}
      {chatExpanded && !isNarrow ? (
        <section className="puc-hall__hearth">
          {/* The whole header row folds the chat — bigger tap target
           *  than the small button alone. */}
          <header
            className="puc-hall__hearth-head"
            role="button"
            tabIndex={0}
            onClick={() => setChatExpanded(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setChatExpanded(false) }
            }}
            aria-label="Fold the chat"
          >
            <h2 className="puc-hall__doors-title puc-hall__hearth-title">
              🔥 The Hearth — Great Hall chat
            </h2>
            <span className="puc-hall__hearth-fold">▾ fold</span>
          </header>
          <div className="puc-hall__hearth-body">
            <ChatPanel canChat={auth.status === 'ready'} />
          </div>
        </section>
      ) : (
        <HearthTicker
          onExpand={() => {
            if (isNarrow) setChatSheetOpen(true)
            else setChatExpanded(true)
          }}
        />
      )}

      {/* Learning + serious chess — the start of the door corridor. */}
      <section className="puc-hall__doors puc-hall__doors--learn">
        <h2 className="puc-hall__doors-title">Learn chess</h2>
        <div className="puc-hall__doors-grid puc-hall__doors-grid--learn">
          {doorsIn('learn')}
        </div>
        {error && <p className="puc-hall__error">{error}</p>}
      </section>

      {/* Real games — the play tier (Phase 2.2). */}
      <section className="puc-hall__doors puc-hall__doors--play">
        <h2 className="puc-hall__doors-title">Play a game</h2>
        <div className="puc-hall__doors-grid puc-hall__doors-grid--learn">
          {doorsIn('play')}
        </div>
      </section>

      <ChampionBanner />

      {/* Leisure / fun rooms — directly after the learn doors so the
       *  two door rows read as one castle corridor. Chat lives below
       *  them at the hearth. */}
      <section className="puc-hall__doors puc-hall__doors--fun">
        <h2 className="puc-hall__doors-title">Take a break</h2>
        <div className="puc-hall__doors-grid puc-hall__doors-grid--fun">
          {doorsIn('fun')}
        </div>
      </section>

      </main>
      </div>

      {isNarrow && chatSheetOpen && (
        <ChatSheet
          canChat={auth.status === 'ready'}
          onClose={() => setChatSheetOpen(false)}
        />
      )}

      {tcTarget !== null && (
        <TimeControlDialog
          busy={creating}
          onCancel={() => setTcTarget(null)}
          onConfirm={handleConfirmTimeControl}
        />
      )}

      {chooserKind && (
        <RoomChooserDialog
          kind={chooserKind}
          rooms={chooserKind === 'chess' ? waiting.chess : waiting.wizard}
          selfNormalizedName={identity.normalizedName}
          onOpenNew={() => handleChooserOpenNew(chooserKind)}
          onClose={() => setChooserKind(null)}
        />
      )}
    </div>
  )
}
