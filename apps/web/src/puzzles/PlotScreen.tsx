// PlotScreen — the server-driven puzzle loop for one plot.
//
// On mount asks the server for the next puzzle in this plot at the
// player's current per-plot rating; renders the board + a sidebar with
// rating, motif, hint/skip controls. On solve calls submitPuzzleAttempt,
// shows the rating delta animation, then a "Next" CTA fetches another
// one. Wrong moves don't penalise — Skip submits a failure.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'

/* three.js chunk — fetched only on first 3D flip (shared with the
 * game screens). */
const Board3D = lazy(() =>
  import('../board3d/Board3D').then((m) => ({ default: m.Board3D })),
)
import { useView3d } from '../board3d/useView3d'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import { useSound } from '../sound/useSound'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useCastle } from '../castle/useCastle'
import { useAuthUid } from '../auth/useAuthUid'
import {
  callGetNextPuzzle,
  callSubmitPuzzleAttempt,
  type Plot,
  type ServerPuzzle,
} from '../firebase/callables'
import { PuzzleExplanation } from './PuzzleExplanation'
import './PlotScreen.css'

const MAX_SQUARE_SIZE = 64

const PLOT_LABELS: Record<Plot, string> = {
  mate: 'Mate Meadow',
  fork: 'Fork Grove',
  pinSkewer: 'Pin & Skewer Vines',
  sacrifice: 'Sacrifice Garden',
  endgame: 'Endgame Pond',
  defense: "Defender's Thicket",
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing' }
  | {
      kind: 'solved'
      ratingBefore: number
      ratingAfter: number
      pointsAdded: number
    }
  | { kind: 'failed'; ratingBefore: number; ratingAfter: number }
  | { kind: 'show-solution'; stepIndex: number }
  | { kind: 'empty' }

export function PlotScreen() {
  const { plot } = useParams<{ plot: string }>()
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, hostId, setCastlePoints } = useCastle()
  const authState = useAuthUid()
  const authReady = authState.status === 'ready'

  const validPlot = isPlot(plot) ? plot : null
  // 3D view — same legality/judging flow, different renderer. The
  // hint arrow has no 3D equivalent, so "Show arrow" is 2D-only.
  const [view3d, setView3d] = useView3d()
  const [fs3d, setFs3d] = useState(false)
  useEffect(() => {
    if (!fs3d) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs3d(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fs3d])
  const plotLabel = validPlot ? PLOT_LABELS[validPlot] : 'Puzzle Garden'

  const [puzzle, setPuzzle] = useState<ServerPuzzle | null>(null)
  const [playerRating, setPlayerRating] = useState<number>(400)
  const [game, setGame] = useState<ChessGame>(() => new ChessGame())
  const [moveIndex, setMoveIndex] = useState(0)
  const [wrongMoves, setWrongMoves] = useState(0)
  const [hintShown, setHintShown] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  // Solved/failed UI lives in the sidebar — drop out of fullscreen so
  // the kid can see the result and the Next button.
  useEffect(() => {
    if (phase.kind === 'solved' || phase.kind === 'failed' || phase.kind === 'empty') setFs3d(false)
  }, [phase.kind])
  const [shake, setShake] = useState(false)
  const [arrowOn, setArrowOn] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  // Load the next puzzle from the server.
  const normalizedName = identity?.normalizedName ?? ''
  const loadNext = useCallback(async () => {
    if (!validPlot) return
    setPhase({ kind: 'loading' })
    setPuzzle(null)
    try {
      const res = await callGetNextPuzzle({
        normalizedName,
        plot: validPlot,
      })
      if (!res.ok) {
        setPhase({ kind: 'empty' })
        return
      }
      setPuzzle(res.puzzle)
      setPlayerRating(res.playerRating)
      setGame(new ChessGame(res.puzzle.fen))
      setMoveIndex(0)
      setWrongMoves(0)
      setHintShown(false)
      setArrowOn(false)
      startedAtRef.current = null
      setPhase({ kind: 'playing' })
    } catch (err) {
      console.error('getNextPuzzle failed:', err)
      setPhase({ kind: 'empty' })
    }
  }, [validPlot, normalizedName])

  useEffect(() => {
    // Gate on auth so the very first call doesn't fire as unauthenticated.
    if (!authReady) return
    // loadNext sets state by design — the effect is the one place we
    // pull the first puzzle for a freshly-mounted plot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNext()
  }, [loadNext, authReady])

  // Same fen-keyed memo trick as PuzzleScreen — ChessGame mutates in place,
  // so we re-derive board state when the fen string changes.
  const fen = puzzle ? game.fen() : ''
  const pieces = useMemo(() => (fen ? piecesFromFen(fen) : {}), [fen])
  const status = game.status()
  const checkSquare =
    status.kind === 'in_progress' && status.inCheck
      ? findKing(pieces, game.turn())
      : null
  const lastMove = useMemo(() => {
    const hist = game.history()
    if (hist.length === 0) return null
    const last = hist[hist.length - 1]!
    return { from: last.from, to: last.to }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen])

  const parseUci = (uci: string): MoveInput => ({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
  })

  const legalDestinationsFrom = useCallback(
    (from: Square) =>
      phase.kind === 'playing' ? game.legalDestinationsFrom(from) : [],
    [game, phase.kind],
  )

  const submit = useCallback(
    async (success: boolean) => {
      if (!puzzle) return
      const timeMs = startedAtRef.current
        ? Date.now() - startedAtRef.current
        : 0
      const res = await callSubmitPuzzleAttempt({
        normalizedName,
        puzzleId: puzzle.id,
        success,
        timeMs,
      })
      if (res.castlePointsAdded > 0) {
        setCastlePoints(res.castlePoints)
      }
      setPlayerRating(res.ratingAfter)
      if (success) {
        setPhase({
          kind: 'solved',
          ratingBefore: res.ratingBefore,
          ratingAfter: res.ratingAfter,
          pointsAdded: res.castlePointsAdded,
        })
      } else {
        setPhase({
          kind: 'failed',
          ratingBefore: res.ratingBefore,
          ratingAfter: res.ratingAfter,
        })
      }
    },
    [puzzle, normalizedName, setCastlePoints],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!puzzle || phase.kind !== 'playing') return
      if (startedAtRef.current === null) startedAtRef.current = Date.now()
      const expected = puzzle.solution[moveIndex]
      if (!expected) return
      const expectedMove = parseUci(expected)
      const isCorrect =
        move.from === expectedMove.from &&
        move.to === expectedMove.to &&
        (move.promotion ?? 'q') === (expectedMove.promotion ?? 'q')
      if (!isCorrect) {
        setWrongMoves((n) => n + 1)
        setShake(true)
        window.setTimeout(() => setShake(false), 400)
        return
      }
      const applied = game.move(expectedMove)
      if (!applied) return
      if (applied.captured) sound.play('capture')
      else sound.play('move')
      const nextIdx = moveIndex + 1
      // Auto-play the scripted opponent reply (odd index in multi-move puzzles).
      if (nextIdx < puzzle.solution.length) {
        const reply = parseUci(puzzle.solution[nextIdx]!)
        window.setTimeout(() => {
          const r = game.move(reply)
          if (r?.captured) sound.play('capture')
          else if (r) sound.play('move')
          setMoveIndex(nextIdx + 1)
          if (nextIdx + 1 >= puzzle.solution.length) {
            void submit(true)
          }
        }, 320)
        setMoveIndex(nextIdx)
        return
      }
      setMoveIndex(nextIdx)
      void submit(true)
    },
    [puzzle, phase.kind, moveIndex, game, sound, submit],
  )

  const onSkip = useCallback(() => {
    if (!puzzle || phase.kind !== 'playing') return
    void submit(false)
  }, [puzzle, phase.kind, submit])

  const onShowArrow = useCallback(() => {
    if (!puzzle || phase.kind !== 'playing') return
    setHintShown(true)
    setArrowOn(true)
    if (startedAtRef.current === null) startedAtRef.current = Date.now()
    window.setTimeout(() => setArrowOn(false), 2000)
  }, [puzzle, phase.kind])

  // Show-solution: replay from start while the engine plays each move.
  const onShowSolution = useCallback(() => {
    if (!puzzle) return
    setGame(new ChessGame(puzzle.fen))
    setMoveIndex(0)
    setPhase({ kind: 'show-solution', stepIndex: 0 })
  }, [puzzle])
  useEffect(() => {
    if (phase.kind !== 'show-solution' || !puzzle) return
    if (phase.stepIndex >= puzzle.solution.length) return
    const id = window.setTimeout(() => {
      const uci = puzzle.solution[phase.stepIndex]!
      game.move(parseUci(uci))
      setPhase({ kind: 'show-solution', stepIndex: phase.stepIndex + 1 })
    }, 700)
    return () => window.clearTimeout(id)
  }, [phase, game, puzzle])

  if (!validPlot) {
    return (
      <div className="puc-plot puc-plot--centered">
        <p>Unknown plot.</p>
        <button
          type="button"
          className="puc-plot__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }

  if (phase.kind === 'loading') {
    return (
      <div className="puc-plot puc-plot--centered">
        <p>Looking for a puzzle in {plotLabel}…</p>
      </div>
    )
  }

  if (phase.kind === 'empty' || !puzzle) {
    return (
      <div className="puc-plot puc-plot--centered">
        <p>No puzzles found in {plotLabel} just now.</p>
        <button
          type="button"
          className="puc-plot__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }

  const sideToMoveLabel = puzzle.sideToMove === 'w' ? 'White' : 'Black'
  const ratingDelta =
    phase.kind === 'solved' || phase.kind === 'failed'
      ? phase.ratingAfter - phase.ratingBefore
      : 0

  return (
    <div className="puc-plot">
      <header className="puc-plot__header">
        <button
          type="button"
          className="puc-plot__back"
          onClick={() => navigate('/puzzles')}
          aria-label="Back to garden"
        >
          ←
        </button>
        <div className="puc-plot__title-wrap">
          <h1 className="puc-plot__title">{plotLabel}</h1>
          <p className="puc-plot__sub">
            Your rating: <strong>{playerRating}</strong>
          </p>
        </div>
      </header>

      <div className="puc-plot__main">
        <div
          className={
            'puc-plot__board' +
            (shake ? ' puc-plot__board--shake' : '') +
            (view3d ? ' puc-plot__board--3d' : '')
          }
        >
          {view3d ? (
            <Suspense
              fallback={<div className="puc-plot__board3d-loading">Carving the 3D board…</div>}
            >
              <Board3D
                pieces={pieces}
                turn={game.turn()}
                legalDestinationsFrom={legalDestinationsFrom}
                onMove={handleMove}
                lastMove={lastMove}
                checkSquare={checkSquare}
                initialSide={puzzle.sideToMove}
              />
            </Suspense>
          ) : (
            <Board
              pieces={pieces}
              turn={game.turn()}
              orientation={puzzle.sideToMove}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              arrows={
                arrowOn
                  ? [
                      {
                        from: puzzle.solution[moveIndex]!.slice(0, 2) as Square,
                        to: puzzle.solution[moveIndex]!.slice(2, 4) as Square,
                      },
                    ]
                  : undefined
              }
              squareSize={SQUARE_SIZE}
            />
          )}
        </div>

        <aside className="puc-plot__side">
          <div className="puc-plot__puzzleinfo">
            <div className="puc-plot__row">
              <span>Puzzle rating</span>
              <strong>{puzzle.difficulty}</strong>
            </div>
            <div className="puc-plot__row">
              <span>To move</span>
              <strong>{sideToMoveLabel}</strong>
            </div>
            <div className="puc-plot__row">
              <span>Motif</span>
              <strong>{puzzle.motifs[0] ?? '—'}</strong>
            </div>
            {wrongMoves > 0 && (
              <div className="puc-plot__row puc-plot__row--warn">
                <span>Wrong tries</span>
                <strong>{wrongMoves}</strong>
              </div>
            )}
          </div>

          {phase.kind === 'playing' && (
            <div className="puc-plot__actions">
              <button
                type="button"
                className={'puc-plot__btn puc-plot__btn--ghost' + (view3d ? ' puc-plot__btn--on' : '')}
                onClick={() => { setView3d((v) => !v); setFs3d(false) }}
                aria-pressed={view3d}
                title={view3d ? 'Back to the flat board' : 'Solve on the 3D board'}
              >
                {view3d ? '🎲 2D board' : '🎲 3D board'}
              </button>
              {view3d && (
                <button
                  type="button"
                  className="puc-plot__btn puc-plot__btn--ghost"
                  onClick={() => setFs3d(true)}
                  title="Fullscreen 3D board"
                >
                  ⛶ Fullscreen
                </button>
              )}
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--ghost"
                onClick={onShowArrow}
                disabled={(hintShown && !arrowOn) || view3d}
                title={view3d ? 'The arrow only shows on the flat board' : undefined}
              >
                {hintShown ? 'Hint shown' : 'Show arrow'}
              </button>
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--ghost"
                onClick={onShowSolution}
              >
                Show solution
              </button>
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--skip"
                onClick={onSkip}
              >
                Skip
              </button>
            </div>
          )}

          {phase.kind === 'solved' && (
            <div className="puc-plot__result puc-plot__result--ok">
              <p className="puc-plot__result-head">Solved!</p>
              <p className="puc-plot__result-delta">
                Rating {phase.ratingBefore}
                {' → '}
                <strong>{phase.ratingAfter}</strong>{' '}
                <span className="puc-plot__delta-num">
                  ({ratingDelta >= 0 ? '+' : ''}
                  {ratingDelta})
                </span>
              </p>
              {phase.pointsAdded > 0 && (
                <p className="puc-plot__result-points">
                  +{phase.pointsAdded} castle points
                </p>
              )}
              {puzzle && <PuzzleExplanation puzzle={puzzle} hostId={hostId} />}
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--primary"
                onClick={loadNext}
              >
                Next puzzle →
              </button>
            </div>
          )}

          {phase.kind === 'failed' && (
            <div className="puc-plot__result puc-plot__result--fail">
              <p className="puc-plot__result-head">Skipped</p>
              <p className="puc-plot__result-delta">
                Rating {phase.ratingBefore}
                {' → '}
                <strong>{phase.ratingAfter}</strong>{' '}
                <span className="puc-plot__delta-num">
                  ({ratingDelta >= 0 ? '+' : ''}
                  {ratingDelta})
                </span>
              </p>
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--primary"
                onClick={loadNext}
              >
                Try another →
              </button>
            </div>
          )}

          {phase.kind === 'show-solution' && (
            <div className="puc-plot__result puc-plot__result--info">
              <p className="puc-plot__result-head">Watching the solution…</p>
              <button
                type="button"
                className="puc-plot__btn puc-plot__btn--primary"
                onClick={loadNext}
              >
                Next puzzle →
              </button>
            </div>
          )}
        </aside>
      </div>

      {view3d && fs3d && (
        <div className="puc-plot__fs3d">
          <Suspense
            fallback={<div className="puc-plot__board3d-loading">Carving the 3D board…</div>}
          >
            <Board3D
              pieces={pieces}
              turn={game.turn()}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              initialSide={puzzle.sideToMove}
            />
          </Suspense>
          <button
            type="button"
            className="puc-plot__fs3d-exit"
            onClick={() => setFs3d(false)}
            aria-label="Exit fullscreen"
            title="Exit fullscreen (ESC)"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function isPlot(s: string | undefined): s is Plot {
  return (
    s === 'mate' ||
    s === 'fork' ||
    s === 'pinSkewer' ||
    s === 'sacrifice' ||
    s === 'endgame' ||
    s === 'defense'
  )
}
