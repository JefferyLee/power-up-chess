import { useCallback, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import clsx from 'clsx'
import type { Color, MoveInput, Piece as PieceModel, Square as SquareName } from '../chess/types'
import { Piece } from './Piece'
import { Square, type SquareHighlights } from './Square'
import { FILES, RANKS, squareColor, squaresInVisualOrder, type File, type Rank } from './squares'
import './Board.css'

export interface BoardProps {
  /** Map of occupied squares to pieces. */
  pieces: Partial<Record<SquareName, PieceModel>>
  /** Whose turn it is — only this side's pieces can be picked up. */
  turn: Color
  /** Board orientation. White at the bottom unless flipped. */
  orientation?: Color
  /** Returns the legal destination squares for a piece on a square. */
  legalDestinationsFrom: (from: SquareName) => SquareName[]
  /** Called when the user attempts a legal move. */
  onMove: (move: MoveInput) => void
  /** Most recently played move, used for highlight. */
  lastMove?: { from: SquareName; to: SquareName } | null
  /** Square of the king currently in check, if any. */
  checkSquare?: SquareName | null
  /** Pixel size of one square. Defaults to 64. */
  squareSize?: number
}

interface DragState {
  from: SquareName
  pointerId: number
  // Pointer position relative to the board root, in pixels.
  x: number
  y: number
}

export function Board({
  pieces,
  turn,
  orientation = 'w',
  legalDestinationsFrom,
  onMove,
  lastMove = null,
  checkSquare = null,
  squareSize = 64,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<SquareName | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoverSquare, setHoverSquare] = useState<SquareName | null>(null)

  const legalFromSelected = useMemo(
    () => (selected ? new Set(legalDestinationsFrom(selected)) : new Set<SquareName>()),
    [selected, legalDestinationsFrom],
  )
  const legalFromDrag = useMemo(
    () => (drag ? new Set(legalDestinationsFrom(drag.from)) : new Set<SquareName>()),
    [drag, legalDestinationsFrom],
  )

  const tryMove = useCallback(
    (from: SquareName, to: SquareName) => {
      if (from === to) return false
      const dests = legalDestinationsFrom(from)
      if (!dests.includes(to)) return false
      // For MVP0 always promote to queen. Promotion-choice UI lands later.
      onMove({ from, to, promotion: 'q' })
      return true
    },
    [legalDestinationsFrom, onMove],
  )

  const pieceOn = useCallback(
    (sq: SquareName) => pieces[sq] ?? null,
    [pieces],
  )

  // Click flow (no drag): tap a piece, then tap a destination.
  const handleSquareClick = useCallback(
    (sq: SquareName) => {
      const piece = pieceOn(sq)
      if (selected) {
        if (sq === selected) {
          setSelected(null)
          return
        }
        const moved = tryMove(selected, sq)
        if (moved) {
          setSelected(null)
          return
        }
        // Clicked a different own piece -> re-select.
        if (piece && piece.color === turn) {
          setSelected(sq)
          return
        }
        setSelected(null)
        return
      }
      if (piece && piece.color === turn) {
        setSelected(sq)
      }
    },
    [pieceOn, selected, tryMove, turn],
  )

  // Pointer-based drag. Falls back to click when the pointer doesn't move.
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest('[data-square]') as HTMLElement | null
      if (!target) return
      const sq = target.dataset.square as SquareName | undefined
      if (!sq) return
      const piece = pieceOn(sq)
      if (!piece || piece.color !== turn) return

      // Start tracking; we'll decide later whether this was a click or a drag.
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      setSelected(sq)
      setDrag({
        from: sq,
        pointerId: e.pointerId,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [pieceOn, turn],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const rect = boardRef.current?.getBoundingClientRect()
      if (!rect) return
      setDrag({ ...drag, x: e.clientX - rect.left, y: e.clientY - rect.top })
      const overEl = document.elementFromPoint(e.clientX, e.clientY)
      const sqEl = overEl?.closest('[data-square]') as HTMLElement | null
      setHoverSquare((sqEl?.dataset.square as SquareName | undefined) ?? null)
    },
    [drag],
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag || e.pointerId !== drag.pointerId) return
      const overEl = document.elementFromPoint(e.clientX, e.clientY)
      const sqEl = overEl?.closest('[data-square]') as HTMLElement | null
      const dropSquare = (sqEl?.dataset.square as SquareName | undefined) ?? null

      if (dropSquare && dropSquare !== drag.from) {
        const moved = tryMove(drag.from, dropSquare)
        if (moved) setSelected(null)
      } else if (!dropSquare) {
        // Dropped outside the board -> cancel.
        setSelected(null)
      } else {
        // Released on the same square -> treat as a click (selection).
        handleSquareClick(drag.from)
      }
      setDrag(null)
      setHoverSquare(null)
    },
    [drag, tryMove, handleSquareClick],
  )

  const handlePointerCancel = useCallback(() => {
    setDrag(null)
    setHoverSquare(null)
  }, [])

  const cells = useMemo(() => squaresInVisualOrder(orientation), [orientation])

  const styleVars: CSSProperties = {
    ['--puc-square-size' as string]: `${squareSize}px`,
  }

  return (
    <div
      ref={boardRef}
      className="puc-board"
      style={styleVars}
      role="grid"
      aria-label="Chess board"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={(e) => {
        // Click fallback for environments where pointerdown was suppressed.
        if (drag) return
        const target = (e.target as HTMLElement).closest('[data-square]') as HTMLElement | null
        const sq = target?.dataset.square as SquareName | undefined
        if (sq) handleSquareClick(sq)
      }}
    >
      {cells.map(({ file, rank }) => {
        const sq = `${file}${rank}` as SquareName
        const piece = pieceOn(sq)
        const isLegalFromActive = legalFromSelected.has(sq) || legalFromDrag.has(sq)
        const isCapture = isLegalFromActive && !!piece && piece.color !== turn
        const highlights: SquareHighlights = {
          selected: selected === sq || drag?.from === sq,
          legalDestination: isLegalFromActive,
          legalCapture: isCapture,
          lastMoveFrom: lastMove?.from === sq,
          lastMoveTo: lastMove?.to === sq,
          check: checkSquare === sq,
          dragOver: hoverSquare === sq && drag !== null && drag.from !== sq,
        }
        const isLeftFile = isLeftColumn(file, orientation)
        const isBottomRank = isBottomRow(rank, orientation)
        return (
          <Square
            key={sq}
            square={sq}
            color={squareColor(file, rank)}
            highlights={highlights}
            fileLabel={isBottomRank ? file : undefined}
            rankLabel={isLeftFile ? rank : undefined}
          >
            {piece && drag?.from !== sq && (
              <Piece
                piece={piece}
                justMoved={lastMove?.to === sq}
                // Re-key on lastMove so the animation re-fires when the same piece
                // makes consecutive moves to different squares.
                key={lastMove?.to === sq ? `${lastMove.from}->${sq}` : sq}
              />
            )}
          </Square>
        )
      })}
      {drag && pieceOn(drag.from) && (
        <div
          className={clsx('puc-board__drag-piece')}
          style={{
            transform: `translate(${drag.x - squareSize / 2}px, ${drag.y - squareSize / 2}px)`,
            width: squareSize,
            height: squareSize,
          }}
        >
          <Piece piece={pieceOn(drag.from)!} dragging />
        </div>
      )}
    </div>
  )
}

function isLeftColumn(file: File, orientation: Color): boolean {
  return orientation === 'w' ? file === FILES[0] : file === FILES[FILES.length - 1]
}

function isBottomRow(rank: Rank, orientation: Color): boolean {
  return orientation === 'w' ? rank === RANKS[0] : rank === RANKS[RANKS.length - 1]
}
