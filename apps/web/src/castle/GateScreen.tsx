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
import { usePublicStats } from './usePublicStats'
import { LivePulsePanel } from './LivePulsePanel'
import './GateScreen.css'

type GatePhase = 'closed' | 'opening' | 'open'

const IDLE_OPEN_MS = 5000
const KNOCK_TO_OPEN_MS = 600

export function GateScreen() {
  const sound = useSound()
  const { identity } = useCastle()
  const publicStats = usePublicStats()
  const [phase, setPhase] = useState<GatePhase>('closed')
  const [knockShake, setKnockShake] = useState(false)
  const idleTimerRef = useRef<number | null>(null)
  const knockTimerRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)
  const shakeTimerRef = useRef<number | null>(null)

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

  // Clear all pending timers on unmount + stop the ambient bed so the
  // wind/chimes don't keep playing inside the castle.
  useEffect(() => {
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
      if (knockTimerRef.current !== null) window.clearTimeout(knockTimerRef.current)
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current)
      if (shakeTimerRef.current !== null) window.clearTimeout(shakeTimerRef.current)
      sound.stopAmbient()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleKnock = useCallback(() => {
    if (phase !== 'closed') return
    sound.play('knock')
    // First knock unlocks audio — start the ambient bed now. Subsequent
    // knocks are no-ops because startAmbient checks the active name.
    sound.startAmbient('gate-night')
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

        <aside className="puc-gate__panel puc-gate__panel--guests">
          <h2 className="puc-gate__panel-title">Today&apos;s visitors</h2>
          <p className="puc-gate__panel-big">
            {publicStats.status === 'ready' ? publicStats.stats.activeToday : '—'}
          </p>
          <p className="puc-gate__panel-note">
            {publicStats.status === 'ready' ? 'in the castle in the last day' : 'loading…'}
          </p>
        </aside>

        <aside className="puc-gate__panel puc-gate__panel--leaderboard puc-gate__scroll">
          <div className="puc-gate__scroll-handle puc-gate__scroll-handle--top" aria-hidden="true" />
          <h2 className="puc-gate__panel-title">Hall of Champions</h2>
          <ol className="puc-gate__leaderboard">
            {publicStats.status === 'ready' && publicStats.stats.topGuests.length > 0 ? (
              publicStats.stats.topGuests.map((g, i) => (
                <li key={`${g.displayName}-${i}`} className="puc-gate__lb-row">
                  <span className="puc-gate__lb-rank">{i + 1}</span>
                  <span className="puc-gate__lb-name">
                    {g.hasCrown
                      ? <span className="puc-gate__lb-mark puc-gate__lb-mark--crown" title="3+ duel wins in a row">🔥</span>
                      : g.hasHalo
                        ? <span className="puc-gate__lb-mark puc-gate__lb-mark--halo" title="Recent duel winner">✨</span>
                        : null}
                    {g.displayName}
                    {g.title && <span className="puc-gate__lb-title"> · {g.title}</span>}
                  </span>
                  <span className="puc-gate__lb-points">{g.castlePoints}</span>
                </li>
              ))
            ) : (
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="puc-gate__lb-row puc-gate__lb-row--placeholder">
                  <span className="puc-gate__lb-rank">{i + 1}</span>
                  <span className="puc-gate__lb-name">—</span>
                  <span className="puc-gate__lb-points">—</span>
                </li>
              ))
            )}
          </ol>
          <p className="puc-gate__panel-note">
            {publicStats.status === 'ready' && publicStats.stats.topGuests.length > 0
              ? 'castle points · lifetime title'
              : 'be the first to set the bar'}
          </p>
          <div className="puc-gate__scroll-handle puc-gate__scroll-handle--bottom" aria-hidden="true" />
        </aside>

        <p className="puc-gate__hint">
          {phase === 'closed' ? 'Tap the door to knock — or wait a moment.' : 'The wicket is opening…'}
        </p>

        <LivePulsePanel />
      </div>

      {phase === 'open' && !identity && <WicketDialog />}
    </div>
  )
}
