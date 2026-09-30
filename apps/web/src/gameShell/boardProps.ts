// The one props bundle a screen builds for its board: everything the
// flat <Board> and the 3D <Board3D> accept, minus the pixel size (the
// stage owns that). BoardStage / Fullscreen3D hand each renderer the
// keys it understands.

import type { BoardProps } from '../board/Board'
import type { Board3DProps } from '../board3d/Board3D'

export type StageBoardProps = Omit<BoardProps, 'squareSize'> & Board3DProps

export function splitBoardProps(board: StageBoardProps) {
  const {
    orientation, arrows, whitePieceSetId, blackPieceSetId, flipBlackPieces,
    initialSide, facing, spellPick, onSpellTarget, badges,
    ...common
  } = board
  return {
    common,
    flat: { orientation, arrows, whitePieceSetId, blackPieceSetId, flipBlackPieces },
    solid: { initialSide, facing, spellPick, onSpellTarget, badges },
  }
}
