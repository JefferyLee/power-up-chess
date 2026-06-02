import { useEffect } from 'react'
import clsx from 'clsx'
import { CapturedPieceGlyph } from '../cosmetics/CapturedPieceGlyph'
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

// Map captured-piece value to a visual intensity tier. Higher value = bigger
// Power Up animation. Queens get the loudest treatment (board flash too).
type Intensity = 'sm' | 'md' | 'lg' | 'xl'

function intensityFor(piece: PieceSymbol): Intensity {
  const value = PIECE_VALUE[piece]
  if (value >= 9) return 'xl' // queen
  if (value >= 5) return 'lg' // rook
  if (value >= 3) return 'md' // minor piece
  return 'sm'                 // pawn
}

// How many particle dots fly out, per intensity.
const PARTICLE_COUNT: Record<Intensity, number> = {
  sm: 0,
  md: 6,
  lg: 8,
  xl: 12,
}

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

  // Capture square centre — anchors the burst + board flash.
  const sqCenterX = (colFromLeft + 0.5) * squareSize
  const sqCenterY = (rowFromTop + 0.5) * squareSize
  // Card sits above the new piece so it doesn't cover the board.
  const cardX = sqCenterX
  const cardY = sqCenterY - squareSize * 0.55

  const intensity = intensityFor(data.capturedPiece)
  const particles = PARTICLE_COUNT[intensity]
  const showFlash = intensity === 'xl'

  return (
    <>
      {showFlash && (
        <div
          className="puc-spark__board-flash"
          style={{
            left: sqCenterX,
            top: sqCenterY,
            width: squareSize * 3,
            height: squareSize * 3,
          }}
          aria-hidden="true"
        />
      )}

      {particles > 0 && (
        <div
          className={clsx('puc-spark__burst', `puc-spark__burst--${intensity}`)}
          style={{ left: sqCenterX, top: sqCenterY }}
          aria-hidden="true"
        >
          {Array.from({ length: particles }).map((_, i) => {
            const angle = (i / particles) * Math.PI * 2
            const distance = squareSize * (intensity === 'xl' ? 1.4 : 1.0)
            const dx = Math.cos(angle) * distance
            const dy = Math.sin(angle) * distance
            return (
              <span
                key={i}
                className="puc-spark__particle"
                style={{
                  ['--puc-dx' as string]: `${dx}px`,
                  ['--puc-dy' as string]: `${dy}px`,
                  animationDelay: `${i * 15}ms`,
                }}
              />
            )
          })}
        </div>
      )}

      <div
        className={clsx('puc-spark', `puc-spark--${intensity}`)}
        style={{ left: cardX, top: cardY }}
        role="status"
        aria-live="polite"
      >
        <span className={`puc-spark__piece puc-piece puc-piece--${data.capturedColor}`}>
          <CapturedPieceGlyph piece={data.capturedPiece} />
        </span>
        <span className="puc-spark__value">+{PIECE_VALUE[data.capturedPiece]}</span>
        <span className="puc-spark__text">{data.text}</span>
      </div>
    </>
  )
}
