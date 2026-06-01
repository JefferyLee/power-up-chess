// Per-player clock display.
//
// Driven by three inputs:
//   - baseMs: stored remaining time at the last tick boundary
//   - lastTickAt: ms timestamp (Date.now domain) when the running side's
//     clock started ticking
//   - running: true if this clock is currently ticking
//
// The displayed value is recomputed every 200ms while running. Switches to a
// red low-time state under 30s. Caller is responsible for handling flag-fall
// (when displayed time hits 0).

import { useEffect, useReducer } from 'react'
import clsx from 'clsx'
import { formatClock } from './timeControl'
import './Clock.css'

interface Props {
  baseMs: number
  lastTickAt: number | null
  running: boolean
  /** Increase tick frequency in the last 10s so the tenths-of-a-second update
   *  smoothly. */
  className?: string
}

export function Clock({ baseMs, lastTickAt, running, className }: Props) {
  const [, tick] = useReducer((n: number) => (n + 1) | 0, 0)

  // Compute displayed time fresh on every render. The tick effect below
  // forces re-renders at a regular cadence — a clock that doesn't read
  // wall-clock time during render isn't a clock.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const displayMs = running && lastTickAt !== null
    ? Math.max(0, baseMs - (nowMs - lastTickAt))
    : baseMs

  const lowTime = displayMs < 30_000
  const veryLow = displayMs < 10_000

  // Wall-clock-driven re-render: 200ms is enough above 10s; switch to 100ms
  // below for smoother tenths.
  useEffect(() => {
    if (!running || lastTickAt === null) return
    const intervalMs = veryLow ? 100 : 200
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [running, lastTickAt, veryLow])

  return (
    <span
      className={clsx(
        'puc-clock',
        running && 'puc-clock--running',
        lowTime && 'puc-clock--low',
        veryLow && 'puc-clock--very-low',
        className,
      )}
      aria-label={`${formatClock(displayMs)} remaining`}
    >
      {formatClock(displayMs)}
    </span>
  )
}
