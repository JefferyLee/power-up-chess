import { useEffect } from 'react'
import { PIECE_GLYPH } from '../board/pieceGlyphs'
import { FILES, RANKS } from '../board/squares'
import type { Color, PieceSymbol, Square } from '../chess/types'
import { PIECE_VALUE } from './pieceValues'
import './CaptureSpark.css'

export interface CaptureSparkData {
  id: number
  square: Square
  capturedPiece: PieceSymbol
  capturedColor: Color
  text: string
}

interface Props {
  data: CaptureSparkData
  squareSize: number
  orientation?: Color
  onDone: (id: number) => void
}

const LIFETIME_MS = 1400

export function CaptureSpark({ data, squareSize, orientation = 'w', onDone }: Props) {
  useEffect(() => {
    const t = setTimeout(() => onDone(data.id), LIFETIME_MS)
    return () => clearTimeout(t)
  }, [data.id, onDone])

  const file = data.square[0] as (typeof FILES)[number]
  const rank = data.square[1] as (typeof RANKS)[number]
  const fileIdx = FILES.indexOf(file)
  const rankIdx = RANKS.indexOf(rank)

  // In white orientation: file 0 is leftmost; rank 0 (1) is at the bottom (row 7).
  // In black orientation: file 0 is rightmost; rank 0 (1) is at the top.
  const colFromLeft = orientation === 'w' ? fileIdx : 7 - fileIdx
  const rowFromTop = orientation === 'w' ? 7 - rankIdx : rankIdx

  // Centre of the square, then nudge up so the card sits above the new piece.
  const cx = (colFromLeft + 0.5) * squareSize
  const cy = (rowFromTop + 0.5) * squareSize - squareSize * 0.55

  return (
    <div
      className="puc-spark"
      style={{ left: cx, top: cy }}
      role="status"
      aria-live="polite"
    >
      <span className={`puc-spark__piece puc-piece puc-piece--${data.capturedColor}`}>
        {PIECE_GLYPH[data.capturedPiece]}
      </span>
      <span className="puc-spark__value">+{PIECE_VALUE[data.capturedPiece]}</span>
      <span className="puc-spark__text">{data.text}</span>
    </div>
  )
}
