// Resolved cosmetics view for components — wraps useCastle so callers
// don't have to know the identity / fallback shape.

import { useCallback } from 'react'
import { useCastle } from '../castle/useCastle'
import {
  DEFAULT_PIECE_SET_ID,
  getPieceSet,
  isPieceSetId,
  type PieceSet,
  type PieceSetId,
} from './pieceSets'

export interface CosmeticsState {
  pieceSet: PieceSet
  pieceSetId: PieceSetId
  /** No-op when there's no signed-in identity. */
  setPieceSetId: (id: PieceSetId) => void
}

export function useCosmetics(): CosmeticsState {
  const { identity, setPieceSetId } = useCastle()
  const stored = identity?.cosmetics?.pieceSet
  const pieceSetId: PieceSetId = isPieceSetId(stored) ? stored : DEFAULT_PIECE_SET_ID
  const pieceSet = getPieceSet(pieceSetId)
  const set = useCallback(
    (id: PieceSetId) => {
      if (!identity) return
      setPieceSetId(id)
    },
    [identity, setPieceSetId],
  )
  return { pieceSet, pieceSetId, setPieceSetId: set }
}
