import { useEffect, useState } from 'react'
import type { HostId } from '../hosts/hosts'
import { HOSTS } from '../hosts/hosts'
import './BrilliantWinCeremony.css'

interface Props {
  winnerName: string
  hostId: HostId
  /** Lucy/Luca recap line — revealed letter-by-letter for emphasis. */
  recap: string
}

const TYPEWRITER_MS_PER_CHAR = 28

/** Tier 2 — the "Brilliant" ceremony that fires only when the viewer's side
 *  wins. Crown rises from below, flowers fall on the sides, fireworks burst
 *  around the headline, and the host's recap reveals one character at a
 *  time as a small avatar pulses next to it. */
export function BrilliantWinCeremony({ winnerName, hostId, recap }: Props) {
  const host = HOSTS[hostId]
  const [revealedChars, setRevealedChars] = useState(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRevealedChars(0)
    if (!recap) return
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setRevealedChars(i)
      if (i >= recap.length) window.clearInterval(id)
    }, TYPEWRITER_MS_PER_CHAR)
    return () => window.clearInterval(id)
  }, [recap])

  const revealed = recap.slice(0, revealedChars)

  return (
    <div className="puc-brilliant" aria-hidden="true">
      {/* Falling flowers — left + right columns of soft petals. Deterministic
          per-index variation so React render purity is preserved. */}
      <div className="puc-brilliant__flowers puc-brilliant__flowers--left">
        {Array.from({ length: 6 }).map((_, i) => (
          <Flower key={`l${i}`} index={i} delay={i * 0.4} side="left" />
        ))}
      </div>
      <div className="puc-brilliant__flowers puc-brilliant__flowers--right">
        {Array.from({ length: 6 }).map((_, i) => (
          <Flower key={`r${i}`} index={i + 6} delay={i * 0.4 + 0.2} side="right" />
        ))}
      </div>

      <div className="puc-brilliant__center">
        <Crown />
        <div className="puc-brilliant__headline-row">
          <h2 className="puc-brilliant__headline">{winnerName} wins!</h2>
        </div>
        <div className="puc-brilliant__recap-row">
          <HostAvatar name={host.name} />
          <p className="puc-brilliant__recap" aria-live="polite">
            <span className="puc-brilliant__recap-text">{revealed}</span>
            {revealedChars < recap.length && <span className="puc-brilliant__recap-caret">|</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

function Crown() {
  return (
    <svg
      className="puc-brilliant__crown"
      viewBox="0 0 64 48"
      width="120"
      height="90"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="puc-crown-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff2b8" />
          <stop offset="50%" stopColor="#f1c34c" />
          <stop offset="100%" stopColor="#a06b14" />
        </linearGradient>
      </defs>
      <path
        d="M4 38 L8 14 L20 28 L32 6 L44 28 L56 14 L60 38 Z"
        fill="url(#puc-crown-grad)"
        stroke="#5a3a0a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="4" y="38" width="56" height="6" fill="#a07020" stroke="#5a3a0a" strokeWidth="1.5" />
      <circle cx="8" cy="14" r="2.4" fill="#fff8de" stroke="#5a3a0a" strokeWidth="1" />
      <circle cx="32" cy="6" r="2.6" fill="#fff8de" stroke="#5a3a0a" strokeWidth="1" />
      <circle cx="56" cy="14" r="2.4" fill="#fff8de" stroke="#5a3a0a" strokeWidth="1" />
      <circle cx="20" cy="42" r="1.8" fill="#c44747" />
      <circle cx="32" cy="42" r="1.8" fill="#4789c4" />
      <circle cx="44" cy="42" r="1.8" fill="#4caf6e" />
    </svg>
  )
}

function Flower({ index, delay, side }: { index: number; delay: number; side: 'left' | 'right' }) {
  // Deterministic per-flower variation — keeps the render pure for React 19.
  // pink-ish hues from 305-355, x-drift roughly -28..+28 px.
  const hue = 305 + ((index * 17) % 50)
  const xDrift = (((index * 41) % 60) - 28).toFixed(1)
  return (
    <svg
      className={`puc-brilliant__flower puc-brilliant__flower--${side}`}
      viewBox="0 0 20 20"
      width="22"
      height="22"
      style={{
        ['--puc-bf-delay' as string]: `${delay}s`,
        ['--puc-bf-x' as string]: `${xDrift}px`,
        ['--puc-bf-hue' as string]: `${hue}`,
      }}
      aria-hidden="true"
    >
      <g fill={`hsl(${hue}, 70%, 75%)`} stroke={`hsl(${hue}, 55%, 45%)`} strokeWidth="0.6">
        <circle cx="10" cy="4" r="3.2" />
        <circle cx="16" cy="10" r="3.2" />
        <circle cx="10" cy="16" r="3.2" />
        <circle cx="4" cy="10" r="3.2" />
      </g>
      <circle cx="10" cy="10" r="2.4" fill="#f1c34c" stroke="#a06b14" strokeWidth="0.6" />
    </svg>
  )
}

function HostAvatar({ name }: { name: string }) {
  return (
    <div className="puc-brilliant__avatar" aria-label={`${name} speaking`}>
      <span className="puc-brilliant__avatar-letter">{name.charAt(0)}</span>
    </div>
  )
}
