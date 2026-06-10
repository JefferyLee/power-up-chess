import clsx from 'clsx'
import { useCosmetics } from '../cosmetics/useCosmetics'
import { getPieceSet, isPieceSetId } from '../cosmetics/pieceSets'
import type { Piece as PieceModel } from '../chess/types'
import './Piece.css'

interface Props {
  piece: PieceModel
  dragging?: boolean
  justMoved?: boolean
  /** Rotate this piece 180°. Used by local face-to-face mode so the two
   *  players sitting across from each other both see their own pieces
   *  upright. */
  flipped?: boolean
  /** Override the rendered set for this specific piece. Used in online
   *  rooms where each side's pieces should render in that player's
   *  equipped set, regardless of who's viewing. Falls back to the
   *  viewer's own local default when undefined or invalid.
   *
   *  ⚠️  Identity-bearing contexts (plaques, user cards) MUST pass a
   *  concrete id — never undefined. With undefined the viewer's set
   *  bleeds through and you'll see your OWN cosmetic on a stranger's
   *  card. Server-side, GetPublicProfileResponse.equippedPieceSet is
   *  typed `string` (defaults to 'classic') for exactly this reason. */
  pieceSetIdOverride?: string
}

export function Piece({ piece, dragging = false, justMoved = false, flipped = false, pieceSetIdOverride }: Props) {
  const local = useCosmetics()
  const effectiveSetId = isPieceSetId(pieceSetIdOverride) ? pieceSetIdOverride : local.pieceSetId
  const effectiveSet =
    effectiveSetId === local.pieceSetId ? local.pieceSet : getPieceSet(effectiveSetId)
  return (
    <span
      className={clsx(
        'puc-piece',
        `puc-piece--${piece.color}`,
        `puc-piece--set-${effectiveSetId}`,
        dragging && 'puc-piece--dragging',
        justMoved && 'puc-piece--just-moved',
        flipped && 'puc-piece--flipped',
      )}
      aria-hidden="true"
    >
      {effectiveSet.glyphFor(piece.type, piece.color)}
    </span>
  )
}
