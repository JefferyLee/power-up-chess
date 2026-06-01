import clsx from 'clsx'
import { PIECE_GLYPH } from './pieceGlyphs'
import type { Piece as PieceModel } from '../chess/types'
import './Piece.css'

interface Props {
  piece: PieceModel
  dragging?: boolean
  justMoved?: boolean
}

export function Piece({ piece, dragging = false, justMoved = false }: Props) {
  return (
    <span
      className={clsx(
        'puc-piece',
        `puc-piece--${piece.color}`,
        dragging && 'puc-piece--dragging',
        justMoved && 'puc-piece--just-moved',
      )}
      aria-hidden="true"
    >
      {PIECE_GLYPH[piece.type]}
    </span>
  )
}
