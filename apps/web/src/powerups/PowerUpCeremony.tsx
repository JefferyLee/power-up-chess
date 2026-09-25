// Power Up capture ceremony — a short, loud overlay that fires on top of
// CaptureSpark every time a piece is taken. Three random variants so the
// celebration never feels samey: classic radial burst, lightning strike,
// comet trail. Each pairs with a matching synth sound (synth.ts).
//
// Lifetime ~1.4 s so the chess flow is never blocked.
//
// On the 3D board a capture is a ~2 s duel (board3d/duel.ts) and this
// full-width overlay landed right on top of the fight, so the screens
// pass `delayMs` there and the ceremony waits for the pop.

import { useEffect, useState } from 'react'
import { playSound } from '../sound/synth'
import type { PowerUpVariant } from './powerUpVariant'
import './PowerUpCeremony.css'

export interface PowerUpData {
  id: number
  variant: PowerUpVariant
}

const LIFETIME_MS = 1800
/** How long the 3D duel takes to reach the pop (approach + two feints). */
export const DUEL_CEREMONY_DELAY_MS = 1900

interface Props {
  data: PowerUpData
  /** Hold the overlay back this long before it plays (0 = at once). */
  delayMs?: number
  onDone: (id: number) => void
}

export function PowerUpCeremony({ data, delayMs = 0, onDone }: Props) {
  const [started, setStarted] = useState(delayMs === 0)
  useEffect(() => {
    if (delayMs === 0) return
    const t = window.setTimeout(() => setStarted(true), delayMs)
    return () => window.clearTimeout(t)
  }, [delayMs])
  useEffect(() => {
    const t = window.setTimeout(() => onDone(data.id), delayMs + LIFETIME_MS)
    return () => window.clearTimeout(t)
  }, [data.id, delayMs, onDone])
  // The matching synth cue plays when the overlay appears, so a delayed
  // ceremony sounds delayed too (the screens used to fire it at move time).
  useEffect(() => {
    if (started) playSound(`powerup-${data.variant}` as const)
  }, [started, data.variant])

  if (!started) return null
  return (
    <div className={`puc-powerup puc-powerup--${data.variant}`} aria-hidden="true">
      {data.variant === 'classic' && <Classic />}
      {data.variant === 'lightning' && <Lightning />}
      {data.variant === 'comet' && <Comet />}
    </div>
  )
}

function Classic() {
  // 8 fireworks arranged radially + big rainbow "Power UP!" headline.
  const bursts = Array.from({ length: 8 }, (_, i) => i)
  return (
    <>
      <div className="puc-powerup__bursts">
        {bursts.map((i) => {
          const angle = (i / 8) * 360
          return (
            <span
              key={i}
              className="puc-powerup__burst"
              style={{ ['--puc-angle' as string]: `${angle}deg`, animationDelay: `${i * 30}ms` }}
            />
          )
        })}
      </div>
      <h2 className="puc-powerup__text puc-powerup__text--classic">
        <span>P</span><span>o</span><span>w</span><span>e</span><span>r</span>
        <span className="puc-powerup__text-space"> </span>
        <span>u</span><span>u</span><span>u</span><span>U</span><span>U</span><span>P</span><span>P</span><span>!</span>
      </h2>
    </>
  )
}

function Lightning() {
  return (
    <>
      <svg className="puc-powerup__bolts" viewBox="0 0 400 300" aria-hidden="true">
        {BOLTS.map((d, i) => (
          <polyline
            key={i}
            points={d}
            fill="none"
            stroke="#fff7c0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animationDelay: `${i * 90}ms` } as React.CSSProperties}
            className="puc-powerup__bolt"
          />
        ))}
      </svg>
      <h2 className="puc-powerup__text puc-powerup__text--lightning">
        <span>P</span><span>o</span><span>w</span><span>e</span><span>r</span>
        <span className="puc-powerup__text-space"> </span>
        <span>u</span><span>u</span><span>u</span><span>U</span><span>U</span><span>P</span><span>P</span><span>!</span>
      </h2>
    </>
  )
}

// Pre-computed once at module load — keeps the comet spark variation while
// staying compatible with React Compiler's purity check (no Math.random in render).
const COMET_SPARKS = Array.from({ length: 12 }, (_, i) => ({
  angle: (i / 12) * 360 + ((i * 37) % 18) - 9,
  distance: 90 + ((i * 53) % 60),
  delay: (i % 6) * 40 + 500,
}))

function Comet() {
  return (
    <>
      <span className="puc-powerup__comet-trail" />
      <span className="puc-powerup__comet-head" />
      <div className="puc-powerup__comet-sparks">
        {COMET_SPARKS.map((s, i) => (
          <span
            key={i}
            className="puc-powerup__comet-spark"
            style={{
              ['--puc-angle' as string]: `${s.angle}deg`,
              ['--puc-distance' as string]: `${s.distance}px`,
              animationDelay: `${s.delay}ms`,
            }}
          />
        ))}
      </div>
      <h2 className="puc-powerup__text puc-powerup__text--comet">
        <span>P</span><span>o</span><span>w</span><span>e</span><span>r</span>
        <span className="puc-powerup__text-space"> </span>
        <span>u</span><span>u</span><span>u</span><span>U</span><span>U</span><span>P</span><span>P</span><span>!</span>
      </h2>
    </>
  )
}

// Six hand-drawn lightning paths emanating from the centre, each at a
// different rotation. SVG viewBox 0 0 400 300 with centre at (200, 150).
const BOLTS = [
  '200,150 220,90 200,80 210,30',
  '200,150 260,120 250,100 290,80',
  '200,150 280,170 270,190 320,200',
  '200,150 230,210 215,220 240,280',
  '200,150 170,210 180,220 150,280',
  '200,150 130,170 140,190 90,200',
  '200,150 120,120 130,100 80,80',
  '200,150 180,90 195,80 185,30',
]
