// BoardStage — the docked board area: the flat <Board> or the lazy 3D
// one, the exact 8×8 pixel footprint in 2D (square-anchored overlays
// position against it), and a note while the 3D board is off playing
// fullscreen. Screens size the 3D stage in their own CSS via
// `.puc-<screen> .puc-stage--3d { … }`.

import { lazy, Suspense, type CSSProperties, type ReactNode, type Ref } from 'react'
import { Board } from '../board/Board'
import type { Board3DProps } from '../board3d/Board3D'
import { splitBoardProps, type StageBoardProps } from './boardProps'
import type { BoardView } from './useBoardView'
import './gameShell.css'

/* three.js + react-three-fiber live in their own chunk — fetched the
 * first time a kid flips a board into 3D. This is the app's one lazy
 * import of it. */
const Board3D = lazy(() =>
  import('../board3d/Board3D').then((m) => ({ default: m.Board3D })),
)

export function LazyBoard3D(props: Board3DProps) {
  return (
    <Suspense fallback={<div className="puc-board3d-loading">Carving the 3D board…</div>}>
      <Board3D {...props} />
    </Suspense>
  )
}

interface Props {
  view: BoardView
  squareSize: number
  board: StageBoardProps
  /** Replaces the flat <Board> — Wizard's Duel brings its own 2D board. */
  board2d?: ReactNode
  /** Overlays inside the stage: capture ceremonies, waiting cards… */
  children?: ReactNode
  className?: string
  /** Merged over the stage's own 2D footprint. */
  style?: CSSProperties
  ref?: Ref<HTMLDivElement>
}

export function BoardStage({ view, squareSize, board, board2d, children, className, style, ref }: Props) {
  const { view3d, fs3d } = view
  const { common, flat, solid } = splitBoardProps(board)
  return (
    <div
      ref={ref}
      className={'puc-stage' + (view3d ? ' puc-stage--3d' : '') + (className ? ' ' + className : '')}
      style={view3d ? style : { width: squareSize * 8, height: squareSize * 8, ...style }}
    >
      {view3d ? (
        fs3d ? (
          <div className="puc-board3d-loading">Playing fullscreen — press ESC or ✕ to return.</div>
        ) : (
          <LazyBoard3D {...common} {...solid} />
        )
      ) : (
        board2d ?? <Board {...common} {...flat} squareSize={squareSize} />
      )}
      {children}
    </div>
  )
}
