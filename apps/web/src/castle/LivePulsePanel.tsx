// Castle gate's "town crier" ticker — surfaces what's happening
// inside the castle to visitors who haven't entered yet. Rotates
// every ~6s through three bands:
//   1. Duels in progress (count)
//   2. The most recent duel result(s) of the past hour
//   3. The last host story's first sentence
//
// Anchored to the bottom of the gate; mobile-friendly single line.

import { useEffect, useMemo, useState } from 'react'
import { useCastleLivePulse, type CastleLivePulse } from './useCastleLivePulse'
import './LivePulsePanel.css'

const ROTATION_MS = 6000

interface Item {
  key: string
  icon: string
  text: string
}

function itemsFor(pulse: CastleLivePulse): Item[] {
  const out: Item[] = []
  if (pulse.duelsInProgress > 0) {
    out.push({
      key: 'duels-in-progress',
      icon: '⚔',
      text: pulse.duelsInProgress === 1
        ? 'A Wizard\'s Duel is happening right now…'
        : `${pulse.duelsInProgress} Wizard's Duels happening right now…`,
    })
  }
  for (const d of pulse.recentDuels) {
    out.push({
      key: `duel-${d.ts}`,
      icon: '🏆',
      // The server already pre-renders these as "🏆 Ada checkmated Tom in a
      // Wizard's Duel!" — strip the leading trophy to avoid double icons.
      text: d.text.replace(/^🏆\s*/, ''),
    })
  }
  if (pulse.lastStory) {
    out.push({
      key: `story-${pulse.lastStory.ts}`,
      icon: pulse.lastStory.hostId === 'lucy' ? '🌿' : '✨',
      text: `${pulse.lastStory.hostId === 'lucy' ? 'Lucy' : 'Luca'} is telling a story: "${pulse.lastStory.snippet}"`,
    })
  }
  return out
}

export function LivePulsePanel() {
  const state = useCastleLivePulse()
  const items = useMemo<Item[]>(
    () => state.status === 'ready' ? itemsFor(state.pulse) : [],
    [state],
  )
  const [rawIndex, setIndex] = useState(0)
  // Modulo at render time so we never have to setState() purely to fix
  // an out-of-bounds index when items.length shrinks (rotation effect
  // below still drives forward motion).
  const index = items.length > 0 ? rawIndex % items.length : 0

  // Auto-rotate.
  useEffect(() => {
    if (items.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length)
    }, ROTATION_MS)
    return () => window.clearInterval(id)
  }, [items.length])

  if (state.status === 'loading' || items.length === 0) {
    return null
  }
  const current = items[index] ?? items[0]!
  return (
    <div className="puc-pulse" aria-live="polite">
      <span className="puc-pulse__icon" aria-hidden="true">{current.icon}</span>
      <span key={current.key} className="puc-pulse__text">{current.text}</span>
      {items.length > 1 && (
        <span className="puc-pulse__dots" aria-hidden="true">
          {items.map((it, i) => (
            <span
              key={it.key}
              className={`puc-pulse__dot${i === index ? ' puc-pulse__dot--on' : ''}`}
            />
          ))}
        </span>
      )}
    </div>
  )
}
