// Crown Spark counter — small inline badge showing the player's accumulated
// crowns. Rendered near the host name in game headers and on the StartScreen
// hero. Reads live from the profile on mount so opening a screen after a
// game-end always sees the latest count.

import { useEffect, useState } from 'react'
import { loadProfile } from '../storage/profile'
import './CrownBadge.css'

interface Props {
  /** Re-read the profile when this value changes — pass any value that
   *  flips after a crown-earning event to force a refresh. */
  watch?: unknown
  variant?: 'inline' | 'large'
}

export function CrownBadge({ watch, variant = 'inline' }: Props) {
  const [count, setCount] = useState<number>(() => loadProfile().crownCount)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(loadProfile().crownCount)
  }, [watch])

  return (
    <span className={`puc-crown puc-crown--${variant}`} aria-label={`${count} crowns earned`}>
      <CrownIcon />
      <span className="puc-crown__count">{count}</span>
    </span>
  )
}

function CrownIcon() {
  return (
    <svg
      width="14"
      height="11"
      viewBox="0 0 16 12"
      className="puc-crown__icon"
      aria-hidden="true"
    >
      <path
        d="M1 10 L2 3 L5 7 L8 1 L11 7 L14 3 L15 10 Z"
        fill="var(--puc-accent, #f1c34c)"
        stroke="var(--puc-accent-strong, #e8a429)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <rect x="1" y="10" width="14" height="1.5" fill="var(--puc-accent-strong, #e8a429)" />
    </svg>
  )
}
