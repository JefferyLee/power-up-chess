import clsx from 'clsx'
import { useCosmetics } from '../cosmetics/useCosmetics'
import type { Piece as PieceModel } from '../chess/types'
import './Piece.css'

interface Props {
  piece: PieceModel
  dragging?: boolean
  justMoved?: boolean
}

export function Piece({ piece, dragging = false, justMoved = false }: Props) {
  const { pieceSet, pieceSetId } = useCosmetics()
  return (
    <span
      className={clsx(
        'puc-piece',
        `puc-piece--${piece.color}`,
        `puc-piece--set-${pieceSetId}`,
        dragging && 'puc-piece--dragging',
        justMoved && 'puc-piece--just-moved',
      )}
      aria-hidden="true"
    >
      {pieceSet.glyphFor(piece.type, piece.color)}
    </span>
  )
}
