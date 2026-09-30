// Fullscreen3D — the 3D board filling the viewport, with whatever the
// screen floats over it (player chips, move nav) and a ✕ to leave.
// z-index 40: the game-end (50) and resign (60) overlays stay on top.

import type { ReactNode } from 'react'
import type { Color } from '../chess/types'
import { LazyBoard3D } from './BoardStage'
import { splitBoardProps, type StageBoardProps } from './boardProps'
import type { BoardView } from './useBoardView'
import './gameShell.css'

export function Fullscreen3D({ view, board, children }: {
  view: BoardView
  board: StageBoardProps
  children?: ReactNode
}) {
  if (!view.view3d || !view.fs3d) return null
  const { common, solid } = splitBoardProps(board)
  return (
    <div className="puc-fs3d">
      <LazyBoard3D {...common} {...solid} />
      {children}
      <button
        type="button"
        className="puc-fs3d__exit"
        onClick={view.exitFs}
        aria-label="Exit fullscreen"
        title="Exit fullscreen (ESC)"
      >
        ✕
      </button>
    </div>
  )
}

/** A player's name (plus an optional clock) floating at the top or
 *  bottom edge of the fullscreen board. */
export function FsChip({ side, color, active, name, children }: {
  side: 'top' | 'bottom'
  color: Color
  active: boolean
  name: string
  children?: ReactNode
}) {
  return (
    <div className={`puc-fs3d__chip puc-fs3d__chip--${side}` + (active ? ' puc-fs3d__chip--active' : '')}>
      <span className={`puc-fs3d__dot puc-fs3d__dot--${color}`} aria-hidden="true" />
      <span>{name}</span>
      {children}
    </div>
  )
}
