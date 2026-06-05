// Knight's Hop — turn-based piece-movement game.
//
// Five levels: PAWN (1 forward / diagonal capture), KNIGHT (four
// forward L-shapes that JUMP over obstacles), BISHOP (forward
// diagonal slide up to 3, can't jump), ROOK (forward straight slide
// up to 3, can't jump), QUEEN (combines bishop + rook moves).
//
// Each level constrains the player to a single piece's chess-legal
// movement, so the kid internalises piece motion by playing with the
// actual rules. The board is 5 columns × 8 visible rows; player
// always rendered at the bottom row. After every move the board
// "scrolls" down by the move's row delta (1-3) and that many fresh
// obstacle rows spawn at the top. Score = total rows scrolled.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import { useSound } from '../../sound/useSound'
import pawnWhite from '../../cosmetics/assets/cburnett/wP.svg'
import pawnBlack from '../../cosmetics/assets/cburnett/bP.svg'
import knightWhite from '../../cosmetics/assets/cburnett/wN.svg'
import bishopWhite from '../../cosmetics/assets/cburnett/wB.svg'
import rookWhite from '../../cosmetics/assets/cburnett/wR.svg'
import queenWhite from '../../cosmetics/assets/cburnett/wQ.svg'
import './KnightsHopRoute.css'

const COLS = 5
const VISIBLE_ROWS = 8
const OBSTACLE_DENSITY = 0.32
const LEVEL_GOAL = 25 // rows-of-progress target
/** Max slide distance for bishop/rook/queen. 3 keeps the queen from
 *  clearing the level in two moves while still feeling powerful. */
const SLIDE_MAX = 3

type Piece = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen'

interface Move {
  col: number
  rowDelta: 1 | 2 | 3
}

interface BoardState {
  /** Player column (always rendered at the bottom row, rowFromBottom=0). */
  col: number
  /** Obstacle rows. Index 0 is rowFromBottom=1 (just above the player),
   *  index N-1 is the topmost visible row. Each row is a 5-bit mask. */
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
  const rows: number[] = []
  for (let r = 0; r < VISIBLE_ROWS - 1; r++) rows.push(makeRowMask())
  return { col: Math.floor(COLS / 2), rows }
}

function cellAt(board: BoardState, col: number, rowFromBottom: number): 'oob' | 'empty' | 'obstacle' {
  if (col < 0 || col >= COLS) return 'oob'
  if (rowFromBottom <= 0) return 'oob'
  const row = board.rows[rowFromBottom - 1]
  if (row === undefined) return 'oob'
  return (row & (1 << col)) !== 0 ? 'obstacle' : 'empty'
}

/** Sliding-piece move generator. For each direction, walk outward up
 *  to maxRange squares. Stop at the first obstacle (which IS a legal
 *  capture target — the piece can't jump over it but can land on it).
 *  Out-of-bounds or backwards (rowDelta < 1) directions are skipped. */
function slidingMoves(
  board: BoardState,
  directions: ReadonlyArray<readonly [dc: number, dr: number]>,
  maxRange: number,
): Move[] {
  const out: Move[] = []
  for (const [dc, dr] of directions) {
    for (let step = 1; step <= maxRange; step++) {
      const c = board.col + dc * step
      const r = dr * step
      if (r < 1 || r > 3) break
      const cell = cellAt(board, c, r)
      if (cell === 'oob') break
      if (cell === 'empty') {
        out.push({ col: c, rowDelta: r as 1 | 2 | 3 })
        continue
      }
      // Obstacle — accept as a capture target then stop the ray.
      out.push({ col: c, rowDelta: r as 1 | 2 | 3 })
      break
    }
  }
  return out
}

function legalMoves(board: BoardState, piece: Piece): Move[] {
  if (piece === 'pawn') {
    const moves: Move[] = []
    const ahead = cellAt(board, board.col, 1)
    if (ahead === 'empty') moves.push({ col: board.col, rowDelta: 1 })
    for (const dc of [-1, +1]) {
      if (cellAt(board, board.col + dc, 1) === 'obstacle') {
        moves.push({ col: board.col + dc, rowDelta: 1 })
      }
    }
    return moves
  }
  if (piece === 'knight') {
    // Four forward L-shapes. Knight jumps so any cell is legal.
    const moves: Move[] = []
    const offsets: Array<[dc: number, dr: 1 | 2]> = [
      [-1, 2], [+1, 2], [-2, 1], [+2, 1],
    ]
    for (const [dc, dr] of offsets) {
      const c = board.col + dc
      const cell = cellAt(board, c, dr)
      if (cell === 'empty' || cell === 'obstacle') {
        moves.push({ col: c, rowDelta: dr })
      }
    }
    return moves
  }
  if (piece === 'bishop') {
    // Forward diagonals only — bishop slides up to SLIDE_MAX.
    return slidingMoves(board, [[-1, 1], [+1, 1]], SLIDE_MAX)
  }
  if (piece === 'rook') {
    // Straight forward only. Sideways slides don't advance score and
    // would let the kid shuffle indefinitely; excluded.
    return slidingMoves(board, [[0, 1]], SLIDE_MAX)
  }
  // queen — bishop + rook combined.
  return slidingMoves(board, [[-1, 1], [0, 1], [+1, 1]], SLIDE_MAX)
}

function step(
  board: BoardState,
  move: Move,
  piece: Piece,
  ensureWinnable: boolean,
): BoardState {
  // Drop the rows the player just traversed; spawn new rows at the
  // top (which is the back of the array — closest-to-player = front).
  const remaining = board.rows.slice(move.rowDelta)
  let topRows: number[] = []
  let tries = 0
  while (true) {
    topRows = []
    for (let i = 0; i < move.rowDelta; i++) topRows.push(makeRowMask())
    const provisional: BoardState = {
      col: move.col,
      rows: [...remaining, ...topRows],
    }
    if (!ensureWinnable || legalMoves(provisional, piece).length > 0) break
    if (++tries > 6) break
  }
  return { col: move.col, rows: [...remaining, ...topRows] }
}

function moveKey(m: Move): string {
  return `${m.col},${m.rowDelta}`
}

interface LevelMeta {
  piece: Piece
  label: string
  sub: string
  legendKeys: { key: string; meaning: string }[]
}

const LEVELS: Record<Piece, LevelMeta> = {
  pawn: {
    piece: 'pawn',
    label: 'Pawn',
    sub: 'One step forward, diagonal to capture.',
    legendKeys: [
      { key: '↑', meaning: 'forward' },
      { key: '←', meaning: 'capture left' },
      { key: '→', meaning: 'capture right' },
    ],
  },
  knight: {
    piece: 'knight',
    label: 'Knight',
    sub: 'Four forward L-shapes — jumps over anything in the way.',
    legendKeys: [
      { key: 'Q', meaning: '−2 col +1 row' },
      { key: 'W', meaning: '−1 col +2 row' },
      { key: 'E', meaning: '+1 col +2 row' },
      { key: 'R', meaning: '+2 col +1 row' },
    ],
  },
  bishop: {
    piece: 'bishop',
    label: 'Bishop',
    sub: 'Slides forward on the diagonals (up to 3). Can\'t jump.',
    legendKeys: [
      { key: 'tap', meaning: 'any glowing diagonal square' },
    ],
  },
  rook: {
    piece: 'rook',
    label: 'Rook',
    sub: 'Slides straight forward (up to 3). Can\'t jump.',
    legendKeys: [
      { key: 'tap', meaning: 'any glowing square ahead' },
    ],
  },
  queen: {
    piece: 'queen',
    label: 'Queen',
    sub: 'Slides forward straight OR diagonal (up to 3). Can\'t jump.',
    legendKeys: [
      { key: 'tap', meaning: 'any glowing forward square' },
    ],
  },
}

const PIECE_ORDER: Piece[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']

const PIECE_SVGS: Record<Piece, string> = {
  pawn: pawnWhite,
  knight: knightWhite,
  bishop: bishopWhite,
  rook: rookWhite,
  queen: queenWhite,
}

export function KnightsHopRoute() {
  const navigate = useNavigate()
  const { hostId } = useCastle()
  const sound = useSound()
  const [piece, setPiece] = useState<Piece>('pawn')
  const [board, setBoard] = useState<BoardState>(() => makeInitialBoard())
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<GameStatus>({ kind: 'idle' })

  const moves = useMemo(
    () => (status.kind === 'playing' ? legalMoves(board, piece) : []),
    [board, piece, status.kind],
  )
  const moveLookup = useMemo(() => {
    const m = new Map<string, Move>()
    for (const mv of moves) m.set(moveKey(mv), mv)
    return m
  }, [moves])

  useEffect(() => {
    if (status.kind !== 'playing') return
    if (score >= LEVEL_GOAL) {
      sound.play('level-up')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus({ kind: 'cleared', score })
      return
    }
    if (moves.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus({ kind: 'stuck', score })
    }
  }, [moves, score, status.kind, sound])

  const start = useCallback(() => {
    setBoard(makeInitialBoard())
    setScore(0)
    setStatus({ kind: 'playing' })
  }, [])

  const handleMove = useCallback(
    (mv: Move) => {
      if (status.kind !== 'playing') return
      const allowed = moveLookup.get(moveKey(mv))
      if (!allowed) return
      setBoard((prev) => step(prev, allowed, piece, true))
      setScore((s) => s + allowed.rowDelta)
    },
    [status.kind, moveLookup, piece],
  )

  const handleCellClick = useCallback(
    (col: number, rowFromBottom: number) => {
      if (rowFromBottom < 1 || rowFromBottom > 3) return
      handleMove({ col, rowDelta: rowFromBottom as 1 | 2 | 3 })
    },
    [handleMove],
  )

  // Keyboard input. Pawn uses arrow keys; knight uses Q/W/E/R since
  // four L-jumps don't map to a 4-direction pad cleanly.
  useEffect(() => {
    if (status.kind !== 'playing') return
    const handler = (e: KeyboardEvent) => {
      if (piece === 'pawn') {
        if (e.key === 'ArrowUp') {
          handleMove({ col: board.col, rowDelta: 1 })
          e.preventDefault()
        } else if (e.key === 'ArrowLeft') {
          handleMove({ col: board.col - 1, rowDelta: 1 })
          e.preventDefault()
        } else if (e.key === 'ArrowRight') {
          handleMove({ col: board.col + 1, rowDelta: 1 })
          e.preventDefault()
        }
      } else {
        // Knight: Q W E R → the four forward L-jumps left-to-right.
        const k = e.key.toLowerCase()
        if (k === 'q') handleMove({ col: board.col - 2, rowDelta: 1 })
        else if (k === 'w') handleMove({ col: board.col - 1, rowDelta: 2 })
        else if (k === 'e') handleMove({ col: board.col + 1, rowDelta: 2 })
        else if (k === 'r') handleMove({ col: board.col + 2, rowDelta: 1 })
        else return
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [piece, board.col, handleMove, status.kind])

  const meta = LEVELS[piece]

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
          <p className="puc-khop__sub">{meta.label} level · {meta.sub}</p>
        </div>
        <div className="puc-khop__levels" role="radiogroup" aria-label="Piece level">
          {PIECE_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === piece}
              className={
                'puc-khop__level-btn ' +
                (p === piece ? 'puc-khop__level-btn--on' : '')
              }
              onClick={() => {
                if (p === piece) return
                setPiece(p)
                setBoard(makeInitialBoard())
                setScore(0)
                setStatus({ kind: 'idle' })
              }}
            >
              {LEVELS[p].label}
            </button>
          ))}
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
          {renderBoard(board, piece, moveLookup, status, handleCellClick)}
        </div>

        {status.kind === 'idle' && (
          <div className="puc-khop__overlay">
            <h2 className="puc-khop__overlay-title">{meta.label} level</h2>
            <p className="puc-khop__overlay-body">
              Cover {LEVEL_GOAL} rows. {meta.sub}{' '}
              {hostId === 'lucy' ? 'Lucy' : 'Luca'}'s cheering for you.
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
              {status.score} rows covered.{' '}
              {(() => {
                const idx = PIECE_ORDER.indexOf(piece)
                const next = PIECE_ORDER[idx + 1]
                return next
                  ? `Try the ${LEVELS[next].label} level next — ${LEVELS[next].sub.toLowerCase()}`
                  : 'You\'ve cleared every level. Try a harder personal best.'
              })()}
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
              No legal {meta.label.toLowerCase()} move from here. You covered{' '}
              {status.score} rows.
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
        {meta.legendKeys.map((l) => (
          <span key={l.key}><kbd>{l.key}</kbd> {l.meaning}</span>
        ))}
        <span>or tap a glowing square</span>
      </footer>
    </div>
  )
}

function renderBoard(
  board: BoardState,
  piece: Piece,
  moveLookup: Map<string, Move>,
  status: GameStatus,
  onClick: (col: number, rowFromBottom: number) => void,
) {
  const playerSvg = PIECE_SVGS[piece]
  const playerLabel = `Your ${LEVELS[piece].label.toLowerCase()}`
  const cells: ReactElement[] = []
  for (let visualRow = 0; visualRow < VISIBLE_ROWS; visualRow++) {
    const rowFromBottom = VISIBLE_ROWS - 1 - visualRow
    const rowMask = rowFromBottom === 0 ? 0 : board.rows[rowFromBottom - 1] ?? 0
    for (let col = 0; col < COLS; col++) {
      const isPlayer = rowFromBottom === 0 && col === board.col
      const isObstacle = (rowMask & (1 << col)) !== 0
      const isTarget =
        status.kind === 'playing' &&
        moveLookup.has(`${col},${rowFromBottom}`)
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
              ? playerLabel
              : isObstacle
                ? `Obstacle column ${col + 1}`
                : `Empty cell column ${col + 1}`
          }
        >
          {isPlayer && (
            <img src={playerSvg} alt="" className="puc-khop__piece" />
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
