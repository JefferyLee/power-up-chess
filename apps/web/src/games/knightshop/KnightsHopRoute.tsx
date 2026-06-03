// Knight's Hop — turn-based piece-movement game (P1.G Slice 1).
//
// Slice 1 ships pawn-only: 5 columns × 8 rows, player at the bottom
// row, taps a legal pawn destination one rank ahead. Forward to an
// empty cell, or diagonal-forward to "capture" an obstacle. Each
// move scrolls a fresh obstacle row in at the top; score = rows
// traveled. Game ends when no legal move is available.
//
// Later slices add knight (L-jumps), bishop (diag slide), rook
// (rank/file slide), and queen (combo) — each on its own level with
// obstacles tuned to that piece's movement constraint. The whole
// idea is to teach piece movement viscerally rather than via text.
//
// The existing Forest Adventure (/forest) coexists for now; we'll
// retire or replace it once the full piece ladder is shipped.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import pawnWhite from '../../cosmetics/assets/cburnett/wP.svg'
import pawnBlack from '../../cosmetics/assets/cburnett/bP.svg'
import './KnightsHopRoute.css'

const COLS = 5
const VISIBLE_ROWS = 8 // visual height of the board
const OBSTACLE_DENSITY = 0.32 // chance each cell in a fresh row gets an obstacle
const LEVEL_GOAL = 25 // rows-traveled target for level complete

interface BoardState {
  /** Player column (always rendered at the bottom row). */
  col: number
  /** Obstacle rows — index 0 is the row just above the player, the
   *  rest stretch upward. Lengths == VISIBLE_ROWS - 1. Each row is a
   *  5-bit mask: bit `c` set ↔ obstacle at column c. */
  rows: number[]
}

type GameStatus =
  | { kind: 'idle' }
  | { kind: 'playing' }
  | { kind: 'cleared'; score: number }
  | { kind: 'stuck'; score: number }

function makeRowMask(): number {
  let mask = 0
  for (let c = 0; c < COLS; c++) {
    if (Math.random() < OBSTACLE_DENSITY) mask |= 1 << c
  }
  return mask
}

function makeInitialBoard(): BoardState {
  // Seed the visible-above-player rows with random obstacles.
  const rows: number[] = []
  for (let r = 0; r < VISIBLE_ROWS - 1; r++) rows.push(makeRowMask())
  return { col: Math.floor(COLS / 2), rows }
}

function legalTargets(board: BoardState): number[] {
  // Targets live in the ROW directly above the player (board.rows[0]).
  // Forward: same column, cell must be empty.
  // Diagonal capture: ±1 column, cell must have an obstacle.
  const targets: number[] = []
  const ahead = board.rows[0] ?? 0
  const left = board.col - 1
  const fwd = board.col
  const right = board.col + 1
  if (fwd >= 0 && fwd < COLS && !(ahead & (1 << fwd))) targets.push(fwd)
  if (left >= 0 && (ahead & (1 << left)) !== 0) targets.push(left)
  if (right < COLS && (ahead & (1 << right)) !== 0) targets.push(right)
  return targets
}

function step(board: BoardState, toCol: number, ensureWinnable: boolean): BoardState {
  // Pop the row the player just moved through (clear any captured
  // obstacle implicitly — that obstacle moved off-board with the
  // popped row).
  const remaining = board.rows.slice(1)
  // Generate a new top row; if ensureWinnable, retry a few times until
  // the player has at least one legal next move.
  let topRow = 0
  let tries = 0
  while (true) {
    topRow = makeRowMask()
    if (!ensureWinnable) break
    // What would the next-turn "ahead" row look like? remaining[0]
    // (still the row immediately above the new player position).
    const nextAhead = remaining[0] ?? topRow
    const provisional: BoardState = {
      col: toCol,
      rows: [nextAhead, ...remaining.slice(1), topRow],
    }
    if (legalTargets(provisional).length > 0) break
    if (++tries > 6) break // give up — the player will hit a stuck end
  }
  return { col: toCol, rows: [...remaining, topRow] }
}

export function KnightsHopRoute() {
  const navigate = useNavigate()
  const { hostId } = useCastle()
  const [board, setBoard] = useState<BoardState>(() => makeInitialBoard())
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<GameStatus>({ kind: 'idle' })

  const targets = useMemo(
    () => (status.kind === 'playing' ? new Set(legalTargets(board)) : new Set<number>()),
    [board, status.kind],
  )

  // After each successful move, check whether the next turn has any
  // legal options. If not the game is over.
  useEffect(() => {
    if (status.kind !== 'playing') return
    if (score >= LEVEL_GOAL) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus({ kind: 'cleared', score })
      return
    }
    if (legalTargets(board).length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus({ kind: 'stuck', score })
    }
  }, [board, score, status.kind])

  const start = useCallback(() => {
    setBoard(makeInitialBoard())
    setScore(0)
    setStatus({ kind: 'playing' })
  }, [])

  const handleCellClick = useCallback(
    (col: number, rowFromBottom: number) => {
      if (status.kind !== 'playing') return
      // Only the row directly above the player (rowFromBottom === 1) is
      // a candidate; other cells are not interactive.
      if (rowFromBottom !== 1) return
      if (!targets.has(col)) return
      setBoard((prev) => step(prev, col, true))
      setScore((s) => s + 1)
    },
    [status.kind, targets],
  )

  // Keyboard input: ←/→ for diagonal captures, ↑ for forward.
  useEffect(() => {
    if (status.kind !== 'playing') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' && targets.has(board.col)) {
        e.preventDefault()
        handleCellClick(board.col, 1)
      } else if (e.key === 'ArrowLeft' && targets.has(board.col - 1)) {
        e.preventDefault()
        handleCellClick(board.col - 1, 1)
      } else if (e.key === 'ArrowRight' && targets.has(board.col + 1)) {
        e.preventDefault()
        handleCellClick(board.col + 1, 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [board.col, targets, status.kind, handleCellClick])

  return (
    <div className="puc-khop">
      <header className="puc-khop__header">
        <button
          type="button"
          className="puc-khop__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-khop__title-wrap">
          <h1 className="puc-khop__title">Knight's Hop</h1>
          <p className="puc-khop__sub">
            Pawn level · move forward to an empty square, diagonally to capture.
          </p>
        </div>
        <div className="puc-khop__score" aria-label="Score">
          <span className="puc-khop__score-label">Hops</span>
          <span className="puc-khop__score-num">{score}</span>
          <span className="puc-khop__score-goal">/ {LEVEL_GOAL}</span>
        </div>
      </header>

      <main className="puc-khop__main">
        <div
          className="puc-khop__board"
          style={
            {
              ['--cols' as string]: COLS,
              ['--rows' as string]: VISIBLE_ROWS,
            } as React.CSSProperties
          }
        >
          {renderBoard(board, targets, status, handleCellClick)}
        </div>

        {status.kind === 'idle' && (
          <div className="puc-khop__overlay">
            <h2 className="puc-khop__overlay-title">Pawn level</h2>
            <p className="puc-khop__overlay-body">
              Hop your pawn forward {LEVEL_GOAL} times. Empty squares ahead, or
              capture an obstacle on a diagonal. {hostId === 'lucy' ? 'Lucy' : 'Luca'}'s
              cheering for you.
            </p>
            <button
              type="button"
              className="puc-khop__overlay-btn"
              onClick={start}
            >
              Start hopping →
            </button>
          </div>
        )}

        {status.kind === 'cleared' && (
          <div className="puc-khop__overlay puc-khop__overlay--ok">
            <h2 className="puc-khop__overlay-title">Level cleared!</h2>
            <p className="puc-khop__overlay-body">
              {status.score} hops without getting stuck. Knight piece arrives in a
              later level.
            </p>
            <button
              type="button"
              className="puc-khop__overlay-btn"
              onClick={start}
            >
              Play again
            </button>
          </div>
        )}

        {status.kind === 'stuck' && (
          <div className="puc-khop__overlay puc-khop__overlay--fail">
            <h2 className="puc-khop__overlay-title">Stuck!</h2>
            <p className="puc-khop__overlay-body">
              No legal pawn move — the row above was empty and the cell ahead is
              blocked. You made it {status.score} hops.
            </p>
            <button
              type="button"
              className="puc-khop__overlay-btn"
              onClick={start}
            >
              Try again
            </button>
          </div>
        )}
      </main>

      <footer className="puc-khop__legend">
        <span><kbd>↑</kbd> forward</span>
        <span><kbd>←</kbd> capture left</span>
        <span><kbd>→</kbd> capture right</span>
        <span>or tap a glowing square</span>
      </footer>
    </div>
  )
}

function renderBoard(
  board: BoardState,
  targets: Set<number>,
  status: GameStatus,
  onClick: (col: number, rowFromBottom: number) => void,
) {
  // We render top-to-bottom so DOM order matches visual order. The
  // board has VISIBLE_ROWS total rows; the bottom row (rowFromBottom=0)
  // is the player, the rows above (1 … VISIBLE_ROWS-1) come from
  // board.rows where index 0 is rowFromBottom=1, etc.
  const cells: ReactElement[] = []
  for (let visualRow = 0; visualRow < VISIBLE_ROWS; visualRow++) {
    const rowFromBottom = VISIBLE_ROWS - 1 - visualRow
    const rowMask = rowFromBottom === 0 ? 0 : board.rows[rowFromBottom - 1] ?? 0
    for (let col = 0; col < COLS; col++) {
      const isPlayer = rowFromBottom === 0 && col === board.col
      const isObstacle = (rowMask & (1 << col)) !== 0
      const isTarget =
        status.kind === 'playing' && rowFromBottom === 1 && targets.has(col)
      const cellClass =
        'puc-khop__cell ' +
        ((visualRow + col) % 2 === 0
          ? 'puc-khop__cell--light '
          : 'puc-khop__cell--dark ') +
        (isTarget ? 'puc-khop__cell--target ' : '')
      cells.push(
        <button
          key={`${visualRow}-${col}`}
          type="button"
          className={cellClass}
          disabled={!isTarget}
          onClick={() => onClick(col, rowFromBottom)}
          aria-label={
            isPlayer
              ? 'Your pawn'
              : isObstacle
                ? `Obstacle column ${col + 1}`
                : `Empty cell column ${col + 1}`
          }
        >
          {isPlayer && (
            <img src={pawnWhite} alt="" className="puc-khop__piece" />
          )}
          {!isPlayer && isObstacle && (
            <img src={pawnBlack} alt="" className="puc-khop__piece puc-khop__piece--obstacle" />
          )}
        </button>,
      )
    }
  }
  return cells
}
