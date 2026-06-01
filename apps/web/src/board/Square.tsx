import clsx from 'clsx'
import { type ReactNode } from 'react'
import type { Square as SquareName } from '../chess/types'
import './Square.css'

export interface SquareHighlights {
  selected?: boolean
  legalDestination?: boolean
  legalCapture?: boolean
  lastMoveFrom?: boolean
  lastMoveTo?: boolean
  check?: boolean
  dragOver?: boolean
}

interface Props {
  square: SquareName
  color: 'light' | 'dark'
  highlights: SquareHighlights
  fileLabel?: string
  rankLabel?: string
  children?: ReactNode
}

export function Square({ square, color, highlights, fileLabel, rankLabel, children }: Props) {
  return (
    <div
      className={clsx(
        'puc-sq',
        `puc-sq--${color}`,
        highlights.selected && 'puc-sq--selected',
        highlights.lastMoveFrom && 'puc-sq--last-from',
        highlights.lastMoveTo && 'puc-sq--last-to',
        highlights.check && 'puc-sq--check',
        highlights.dragOver && 'puc-sq--drag-over',
      )}
      data-square={square}
      role="gridcell"
      aria-label={square}
    >
      {fileLabel && <span className="puc-sq__file-label">{fileLabel}</span>}
      {rankLabel && <span className="puc-sq__rank-label">{rankLabel}</span>}
      <div className="puc-sq__piece-layer">{children}</div>
      {highlights.legalDestination && !highlights.legalCapture && <span className="puc-sq__dot" />}
      {highlights.legalCapture && <span className="puc-sq__capture-ring" />}
    </div>
  )
}
