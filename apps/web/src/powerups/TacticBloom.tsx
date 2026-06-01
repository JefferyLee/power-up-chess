// Tactic Bloom — flower-burst overlay that fires on a "forcing capture":
// any capture of a piece worth ≥3 that either delivers check or was made
// while the moving side was in check (a check-and-respond exchange).
//
// Visually it overlays on top of the existing CaptureSpark — eight colored
// petals fan out and a soft glow ring expands beneath. Lifetime is short
// so it doesn't dominate the regular capture animation.

import { useEffect } from 'react'
import { FILES, RANKS } from '../board/squares'
import type { Color, Square } from '../chess/types'
import './TacticBloom.css'

export interface TacticBloomData {
  id: number
  square: Square
}

interface Props {
  data: TacticBloomData
  squareSize: number
  orientation?: Color
  onDone: (id: number) => void
}

const LIFETIME_MS = 1200
const PETAL_COUNT = 8
const PETAL_COLORS = [
  '#f9c0d4', '#f6a4c0', '#ffd28a', '#c9e8a3',
  '#a3dbe8', '#b9b0ef', '#f6a4c0', '#ffd28a',
]

export function TacticBloom({ data, squareSize, orientation = 'w', onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(() => onDone(data.id), LIFETIME_MS)
    return () => clearTimeout(t)
  }, [data.id, onDone])

  const file = data.square[0] as (typeof FILES)[number]
  const rank = data.square[1] as (typeof RANKS)[number]
  const fileIdx = FILES.indexOf(file)
  const rankIdx = RANKS.indexOf(rank)
  const colFromLeft = orientation === 'w' ? fileIdx : 7 - fileIdx
  const rowFromTop = orientation === 'w' ? 7 - rankIdx : rankIdx
  const cx = (colFromLeft + 0.5) * squareSize
  const cy = (rowFromTop + 0.5) * squareSize

  return (
    <div
      className="puc-bloom"
      style={{ left: cx, top: cy, width: squareSize * 2.2, height: squareSize * 2.2 }}
      aria-hidden="true"
    >
      <span className="puc-bloom__ring" />
      {Array.from({ length: PETAL_COUNT }).map((_, i) => {
        const angle = (i / PETAL_COUNT) * 360
        return (
          <span
            key={i}
            className="puc-bloom__petal"
            style={{
              ['--puc-bloom-angle' as string]: `${angle}deg`,
              background: PETAL_COLORS[i % PETAL_COLORS.length],
              animationDelay: `${i * 25}ms`,
            }}
          />
        )
      })}
    </div>
  )
}
