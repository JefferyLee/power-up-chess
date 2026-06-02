// Castle gate's "town crier" ticker — the pulse that tells visitors
// what's happening inside before they sign in. Rotates every ~5s
// through a pool of social signals:
//
//   • visitorsToday  — "12 friends explored the castle today"
//   • inHallNow      — "In the Hall right now: Ada, Tom, Mei"
//   • topSolvers     — "Top puzzle solvers today: Mei (24) · Ada (18) · Liam (12)"
//   • duelsInProg    — "A Wizard's Duel is happening right now"
//   • recentDuels    — "Ada checkmated Tom · 3 min ago"
//   • lastStory      — "Lucy is telling 'The Greek Beggar'… [Read →]"
//                       (tap → full-text overlay, no quiz)
//
// Anchored to the bottom of the gate; mobile-friendly single line.

import { useEffect, useMemo, useState } from 'react'
import { useCastleLivePulse, type CastleLivePulse } from './useCastleLivePulse'
import './LivePulsePanel.css'

const ROTATION_MS = 5000

interface Item {
  key: string
  icon: string
  text: string
  /** If present, the item is tappable and opens the full-story overlay. */
  story?: { hostId: 'lucy' | 'luca'; body: string }
}

function hostLabel(hostId: 'lucy' | 'luca'): string {
  return hostId === 'lucy' ? 'Lucy' : 'Luca'
}

function itemsFor(pulse: CastleLivePulse): Item[] {
  const out: Item[] = []

  // Visitors today — only show when there's actual activity.
  if (typeof pulse.visitorsToday === 'number' && pulse.visitorsToday > 0) {
    out.push({
      key: 'visitors',
      icon: '🌟',
      text:
        pulse.visitorsToday === 1
          ? '1 friend explored the castle today'
          : `${pulse.visitorsToday} friends explored the castle today`,
    })
  }

  // In hall now.
  if (pulse.inHallNow && pulse.inHallNow.length > 0) {
    const names = pulse.inHallNow.map((p) => p.displayName).join(', ')
    out.push({
      key: 'in-hall-now',
      icon: '👥',
      text: `In the Hall right now: ${names}`,
    })
  }

  // Top puzzle solvers today.
  if (pulse.topSolversToday && pulse.topSolversToday.length > 0) {
    const txt = pulse.topSolversToday
      .map((s) => `${s.displayName} (${s.count})`)
      .join(' · ')
    out.push({
      key: 'top-solvers',
      icon: '🧩',
      text: `Today's top puzzle solvers: ${txt}`,
    })
  }

  // Duels in progress.
  if (pulse.duelsInProgress > 0) {
    out.push({
      key: 'duels-in-progress',
      icon: '⚔',
      text:
        pulse.duelsInProgress === 1
          ? "A Wizard's Duel is happening right now…"
          : `${pulse.duelsInProgress} Wizard's Duels happening right now…`,
    })
  }

  // Recent duel results.
  for (const d of pulse.recentDuels) {
    out.push({
      key: `duel-${d.ts}`,
      icon: '🏆',
      // The server pre-renders these like "🏆 Ada checkmated Tom in a
      // Wizard's Duel!" — strip the leading trophy to avoid double icons.
      text: d.text.replace(/^🏆\s*/, ''),
    })
  }

  // Last host story — snippet for the ticker, full body for the overlay.
  if (pulse.lastStory) {
    const who = hostLabel(pulse.lastStory.hostId)
    out.push({
      key: `story-${pulse.lastStory.ts}`,
      icon: pulse.lastStory.hostId === 'lucy' ? '🌿' : '✨',
      text: `${who} is telling a story: "${pulse.lastStory.snippet}" — tap to read`,
      ...(pulse.lastStory.body
        ? { story: { hostId: pulse.lastStory.hostId, body: pulse.lastStory.body } }
        : {}),
    })
  }

  return out
}

export function LivePulsePanel() {
  const state = useCastleLivePulse()
  const items = useMemo<Item[]>(
    () => (state.status === 'ready' ? itemsFor(state.pulse) : []),
    [state],
  )
  const [rawIndex, setIndex] = useState(0)
  const [storyOpen, setStoryOpen] = useState<Item['story'] | null>(null)
  // Modulo at render time so a shrinking items.length doesn't need state.
  const index = items.length > 0 ? rawIndex % items.length : 0

  // Pause rotation while the overlay is open.
  useEffect(() => {
    if (storyOpen) return
    if (items.length <= 1) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length)
    }, ROTATION_MS)
    return () => window.clearInterval(id)
  }, [items.length, storyOpen])

  if (state.status === 'loading' || items.length === 0) return null
  const current = items[index] ?? items[0]!
  const tappable = !!current.story

  return (
    <>
      <button
        type="button"
        className={'puc-pulse' + (tappable ? ' puc-pulse--tappable' : '')}
        aria-live="polite"
        onClick={() => {
          if (current.story) setStoryOpen(current.story)
        }}
        disabled={!tappable}
      >
        <span className="puc-pulse__icon" aria-hidden="true">{current.icon}</span>
        <span key={current.key} className="puc-pulse__text">{current.text}</span>
        {items.length > 1 && (
          <span className="puc-pulse__dots" aria-hidden="true">
            {items.map((it, i) => (
              <span
                key={it.key}
                className={'puc-pulse__dot' + (i === index ? ' puc-pulse__dot--on' : '')}
              />
            ))}
          </span>
        )}
      </button>

      {storyOpen && (
        <StoryOverlay story={storyOpen} onClose={() => setStoryOpen(null)} />
      )}
    </>
  )
}

function StoryOverlay({
  story,
  onClose,
}: {
  story: NonNullable<Item['story']>
  onClose: () => void
}) {
  // ESC closes; backdrop click closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="puc-pulse-overlay"
      role="dialog"
      aria-label={`Story from ${hostLabel(story.hostId)}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="puc-pulse-overlay__card">
        <div className="puc-pulse-overlay__head">
          <span className="puc-pulse-overlay__who">
            {story.hostId === 'lucy' ? '🌿' : '✨'} {hostLabel(story.hostId)}&apos;s story
          </span>
          <button
            type="button"
            className="puc-pulse-overlay__close"
            onClick={onClose}
            aria-label="Close story"
          >
            ✕
          </button>
        </div>
        <div className="puc-pulse-overlay__body">
          {story.body.split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
    </div>
  )
}
