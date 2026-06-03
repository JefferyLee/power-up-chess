// The Castle Gate — public-facing entry page.
//
// Shows castle name, live guest count, top-5 leaderboard (placeholders in
// Phase A; wired to castle_public/stats in Phase B), and a stylised gate
// with a wicket the visitor can knock on. After the first knock OR 5 s
// of idle, the wicket creaks open and the WicketDialog appears for the
// name + magic word.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSound } from '../sound/useSound'
import { WicketDialog } from './WicketDialog'
import { useCastle } from './useCastle'
import { CastleArt } from './CastleArt'
import { usePublicStats, type PublicStatsState } from './usePublicStats'
import { LivePulsePanel } from './LivePulsePanel'
import { CastleSign } from './CastleSign'
import { useCastleLivePulse, type CastleLivePulse, type CastleLivePulseState } from './useCastleLivePulse'
import './GateScreen.css'

type GatePhase = 'closed' | 'opening' | 'open'

const IDLE_OPEN_MS = 5000
const KNOCK_TO_OPEN_MS = 600

type OpenPanel = 'activity' | 'champions' | null

export function GateScreen() {
  const sound = useSound()
  const { identity } = useCastle()
  const publicStats = usePublicStats()
  const livePulse = useCastleLivePulse()
  const [phase, setPhase] = useState<GatePhase>('closed')
  const [knockShake, setKnockShake] = useState(false)
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const idleTimerRef = useRef<number | null>(null)
  const knockTimerRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)

  // ESC closes whichever corner-panel overlay is open.
  useEffect(() => {
    if (openPanel === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPanel(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPanel])

  const beginOpening = useCallback(() => {
    setPhase((prev) => {
      if (prev !== 'closed') return prev
      sound.play('wicket-creak')
      // After the creak animation finishes, mark as fully open so the dialog renders.
      // 850 ms lines the parchment unfurl up with the chime tail of the
      // (now ~1.5 s) wicket-creak sound. Earlier and the dialog pops in
      // over the door groan; later and the chime feels disconnected.
      openTimerRef.current = window.setTimeout(() => setPhase('open'), 850)
      return 'opening'
    })
  }, [sound])

  // Idle timer: auto-open the wicket if the visitor just stands there.
  useEffect(() => {
    if (phase !== 'closed') return
    idleTimerRef.current = window.setTimeout(beginOpening, IDLE_OPEN_MS)
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    }
  }, [phase, beginOpening])

  // Ambient wind/chime bed — try to start as soon as the gate mounts so
  // the wind is already breathing when the visitor arrives. Browser
  // autoplay policy may keep the AudioContext suspended until the user
  // interacts; a one-shot window-level listener resumes it on the very
  // first pointer/key event. Once any sound has played (e.g. clicking
  // the door), the second startAmbient call is a no-op because the
  // ambient with that name is already running.
  useEffect(() => {
    sound.startAmbient('gate-night')
    const unlockOnGesture = (): void => { sound.startAmbient('gate-night') }
    window.addEventListener('pointerdown', unlockOnGesture, { once: true })
    window.addEventListener('keydown', unlockOnGesture, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture)
      window.removeEventListener('keydown', unlockOnGesture)
      sound.stopAmbient()
    }
  }, [sound])

  // Clear all pending timers on unmount. Ambient cleanup lives in its
  // own effect above (alongside the start call), so navigating into the
  // castle silences the wind/chimes there.
  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
      if (knockTimerRef.current !== null) window.clearTimeout(knockTimerRef.current)
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
    }
  }, [])

  const handleKnock = useCallback(() => {
    if (phase !== 'closed') return
    sound.play('knock')
    setKnockShake(true)
    if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
    shakeTimerRef.current = window.setTimeout(() => setKnockShake(false), 600)
    // Knock → wicket opens shortly after (overrides the 5 s idle timer).
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
    if (knockTimerRef.current === null) {
      knockTimerRef.current = window.setTimeout(beginOpening, KNOCK_TO_OPEN_MS)
    }
  }, [phase, sound, beginOpening])

  return (
    <div className="puc-gate">
      <div
        className={`puc-gate__door puc-gate__door--${phase}${knockShake ? ' puc-gate__door--knocked' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Knock on the castle gate"
        onClick={handleKnock}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleKnock()
          }
        }}
      >
        <CastleArt phase={phase} />
      </div>

      <div className="puc-gate__overlay">
        <header className="puc-gate__header">
          <h1 className="puc-gate__title">Power Up Castle</h1>
          <p className="puc-gate__tagline">Knock on the door, and we&apos;ll let you in.</p>
        </header>

        <ActivityPanel pulse={livePulse} onExpand={() => setOpenPanel('activity')} />

        <ChampionsPanel stats={publicStats} onExpand={() => setOpenPanel('champions')} />

        <p className="puc-gate__hint">
          {phase === 'closed' ? 'Tap the door to knock — or wait a moment.' : 'The wicket is opening…'}
        </p>

        <LivePulsePanel />
        <CastleSign />
      </div>

      {phase === 'open' && !identity && <WicketDialog />}

      {openPanel === 'activity' && (
        <CornerOverlay
          title="Now in the castle"
          onClose={() => setOpenPanel(null)}
        >
          <ActivityList pulse={livePulse} verbose />
        </CornerOverlay>
      )}
      {openPanel === 'champions' && (
        <CornerOverlay
          title="Hall of Champions"
          onClose={() => setOpenPanel(null)}
        >
          <ChampionsList stats={publicStats} />
        </CornerOverlay>
      )}
    </div>
  )
}

// ── Activity panel (top-left) ──────────────────────────────────────────

interface ActivityItem {
  key: string
  icon: string
  text: string
}

function activityItems(pulse: CastleLivePulse | null): ActivityItem[] {
  if (!pulse) return []
  const out: ActivityItem[] = []
  if (pulse.inHallNow && pulse.inHallNow.length > 0) {
    const names = pulse.inHallNow.map((p) => p.displayName).join(', ')
    out.push({
      key: 'in-hall',
      icon: '👥',
      text:
        pulse.inHallNow.length === 1
          ? `${names} is in the Hall`
          : `In the Hall: ${names}`,
    })
  }
  if (pulse.duelsInProgress > 0) {
    out.push({
      key: 'duels',
      icon: '⚔',
      text:
        pulse.duelsInProgress === 1
          ? "A Wizard's Duel is happening"
          : `${pulse.duelsInProgress} Wizard's Duels happening`,
    })
  }
  if (pulse.topSolversToday && pulse.topSolversToday.length > 0) {
    const top = pulse.topSolversToday
      .slice(0, 3)
      .map((s) => `${s.displayName} (${s.count})`)
      .join(' · ')
    out.push({ key: 'top-solvers', icon: '🧩', text: `Top solvers: ${top}` })
  }
  for (const d of pulse.recentDuels.slice(0, 2)) {
    out.push({ key: `duel-${d.ts}`, icon: '🏆', text: d.text.replace(/^🏆\s*/, '') })
  }
  if (pulse.lastStory) {
    const who = pulse.lastStory.hostId === 'lucy' ? 'Lucy' : 'Luca'
    out.push({
      key: `story-${pulse.lastStory.ts}`,
      icon: pulse.lastStory.hostId === 'lucy' ? '🌿' : '✨',
      text: `${who} is telling a story`,
    })
  }
  if (typeof pulse.visitorsToday === 'number' && pulse.visitorsToday > 0) {
    out.push({
      key: 'visitors',
      icon: '🌟',
      text: `${pulse.visitorsToday} ${pulse.visitorsToday === 1 ? 'friend' : 'friends'} today`,
    })
  }
  return out
}

function ActivityPanel({
  pulse,
  onExpand,
}: {
  pulse: CastleLivePulseState
  onExpand: () => void
}) {
  const items = pulse.status === 'ready' ? activityItems(pulse.pulse) : []
  const preview = items.slice(0, 3)
  const compact = items[0]
  return (
    <div
      className="puc-gate__panel puc-gate__panel--activity"
      role="button"
      tabIndex={0}
      aria-label="See what's happening in the castle"
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onExpand()
        }
      }}
    >
      <h2 className="puc-gate__panel-title">Now in the castle</h2>
      {items.length === 0 ? (
        <p className="puc-gate__panel-note">
          {pulse.status === 'loading' ? 'listening…' : 'Quiet for now.'}
        </p>
      ) : (
        <>
          <ul className="puc-gate__activity puc-gate__activity--full">
            {preview.map((it) => (
              <li key={it.key}>
                <span className="puc-gate__activity-icon" aria-hidden="true">{it.icon}</span>
                <span className="puc-gate__activity-text">{it.text}</span>
              </li>
            ))}
          </ul>
          {compact && (
            <p className="puc-gate__activity-compact" aria-hidden="true">
              <span className="puc-gate__activity-icon">{compact.icon}</span>
              <span>{compact.text}</span>
            </p>
          )}
          <p className="puc-gate__panel-note">tap for more →</p>
        </>
      )}
    </div>
  )
}

function ActivityList({
  pulse,
  verbose,
}: {
  pulse: CastleLivePulseState
  verbose?: boolean
}) {
  const items = pulse.status === 'ready' ? activityItems(pulse.pulse) : []
  if (items.length === 0) {
    return (
      <p className="puc-gate__overlay-empty">
        {pulse.status === 'loading' ? 'Listening for activity…' : 'The castle is quiet right now.'}
      </p>
    )
  }
  return (
    <ul className={'puc-gate__activity puc-gate__activity--list' + (verbose ? ' puc-gate__activity--verbose' : '')}>
      {items.map((it) => (
        <li key={it.key}>
          <span className="puc-gate__activity-icon" aria-hidden="true">{it.icon}</span>
          <span className="puc-gate__activity-text">{it.text}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Champions panel (top-right) ────────────────────────────────────────

function ChampionsPanel({
  stats,
  onExpand,
}: {
  stats: PublicStatsState
  onExpand: () => void
}) {
  const top = stats.status === 'ready' ? stats.stats.topGuests : []
  const top1 = top[0]
  return (
    <div
      className="puc-gate__panel puc-gate__panel--leaderboard puc-gate__scroll"
      role="button"
      tabIndex={0}
      aria-label="Open Hall of Champions"
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onExpand()
        }
      }}
    >
      <div className="puc-gate__scroll-handle puc-gate__scroll-handle--top" aria-hidden="true" />
      <h2 className="puc-gate__panel-title">Hall of Champions</h2>
      <div className="puc-gate__champions-full">
        <ChampionsList stats={stats} />
      </div>
      <p className="puc-gate__champions-compact" aria-hidden="true">
        <span className="puc-gate__lb-mark puc-gate__lb-mark--crown">🏆</span>
        {top1 ? (
          <>
            <span className="puc-gate__lb-name">{top1.displayName}</span>
            <span className="puc-gate__lb-points">{top1.castlePoints}</span>
          </>
        ) : (
          <span className="puc-gate__lb-name">Champions</span>
        )}
      </p>
      <p className="puc-gate__panel-note">
        {top.length > 0 ? 'tap for the full hall →' : 'be the first to set the bar'}
      </p>
      <div className="puc-gate__scroll-handle puc-gate__scroll-handle--bottom" aria-hidden="true" />
    </div>
  )
}

function ChampionsList({ stats }: { stats: PublicStatsState }) {
  if (stats.status !== 'ready' || stats.stats.topGuests.length === 0) {
    return (
      <ol className="puc-gate__leaderboard">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="puc-gate__lb-row puc-gate__lb-row--placeholder">
            <span className="puc-gate__lb-rank">{i + 1}</span>
            <span className="puc-gate__lb-name">—</span>
            <span className="puc-gate__lb-points">—</span>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <ol className="puc-gate__leaderboard">
      {stats.stats.topGuests.map((g, i) => (
        <li key={`${g.displayName}-${i}`} className="puc-gate__lb-row">
          <span className="puc-gate__lb-rank">{i + 1}</span>
          <span className="puc-gate__lb-name">
            {g.hasTournamentCrown
              ? <span className="puc-gate__lb-mark puc-gate__lb-mark--crown" title="Weekly Tournament champion">🏆</span>
              : g.hasCrown
                ? <span className="puc-gate__lb-mark puc-gate__lb-mark--crown" title="3+ duel wins in a row">🔥</span>
                : g.hasHalo
                  ? <span className="puc-gate__lb-mark puc-gate__lb-mark--halo" title="Recent duel winner">✨</span>
                  : null}
            {g.displayName}
            {g.title && <span className="puc-gate__lb-title"> · {g.title}</span>}
          </span>
          <span className="puc-gate__lb-points">{g.castlePoints}</span>
        </li>
      ))}
    </ol>
  )
}

// ── Shared overlay (modal) ─────────────────────────────────────────────

function CornerOverlay({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="puc-gate-overlay"
      role="dialog"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="puc-gate-overlay__card">
        <div className="puc-gate-overlay__head">
          <span className="puc-gate-overlay__title">{title}</span>
          <button
            type="button"
            className="puc-gate-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="puc-gate-overlay__body">{children}</div>
      </div>
    </div>
  )
}
