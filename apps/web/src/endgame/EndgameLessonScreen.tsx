// EndgameLessonScreen — play a single endgame drill.
//
// Player is White, Stockfish plays Black at expert level so the
// defender behaves like a stubborn lone king. The lesson is cleared
// the moment chess.js reports checkmate with the player as winner.
// Stalemate, threefold, or 50-move triggers "Try again."

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { Color, MoveInput, Square } from '../chess/types'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useSound } from '../sound/useSound'
import { AiOpponent } from '../ai/AiOpponent'
import { difficultyById } from '../ai/difficulty'
import { getLesson } from './lessons'
import './EndgameLessonScreen.css'

const MAX_SQUARE_SIZE = 72

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing' }
  | { kind: 'thinking' }
  | { kind: 'cleared'; moves: number }
  | { kind: 'failed'; reason: 'stalemate' | 'draw'; moves: number }
  | { kind: 'error'; message: string }

const PLAYER_COLOR: Color = 'w'

export function EndgameLessonScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const lesson = useMemo(() => getLesson(id), [id])

  // Engine: hard-tier Stockfish so the defender plays best.
  const [opponent] = useState(() => new AiOpponent())
  const preset = difficultyById('hard')
  useEffect(() => () => opponent.terminate(), [opponent])

  const [game, setGame] = useState<ChessGame>(() =>
    lesson ? new ChessGame(lesson.startFen) : new ChessGame(),
  )
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [moveCount, setMoveCount] = useState(0)
  // Tick: bumped after every applied move so derived board state (fen,
  // pieces, status) recomputes — ChessGame mutates in place.
  const [tick, setTick] = useState(0)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!lesson) return
    let cancelled = false
    opponent
      .ready()
      .then(() => {
        if (cancelled) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase({ kind: 'playing' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [opponent, lesson])

  // Derived per-tick.
  const fen = game.fen()
  const pieces = useMemo(() => piecesFromFen(fen), [fen])
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
  }, [tick])

  // Resolve terminal status into a phase transition.
  useEffect(() => {
    if (phase.kind !== 'playing' && phase.kind !== 'thinking') return
    if (status.kind === 'checkmate') {
      if (status.winner === PLAYER_COLOR) {
        sound.play('mate-win')
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase({ kind: 'cleared', moves: moveCount })
      } else {
        sound.play('mate-loss')
        setPhase({ kind: 'failed', reason: 'draw', moves: moveCount })
      }
    } else if (status.kind === 'stalemate') {
      sound.play('draw')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: 'failed', reason: 'stalemate', moves: moveCount })
    } else if (status.kind === 'draw') {
      sound.play('draw')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: 'failed', reason: 'draw', moves: moveCount })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase.kind])

  const legalDestinationsFrom = useCallback(
    (from: Square) =>
      phase.kind === 'playing' && game.turn() === PLAYER_COLOR
        ? game.legalDestinationsFrom(from)
        : [],
    [phase.kind, game],
  )

  const playAi = useCallback(async () => {
    if (cancelledRef.current) return
    setPhase({ kind: 'thinking' })
    try {
      const uci = await opponent.pickMove(game.fen(), preset.settings)
      if (cancelledRef.current) return
      const move: MoveInput = {
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion:
          uci.length === 5
            ? (uci[4] as 'q' | 'r' | 'b' | 'n')
            : undefined,
      }
      const result = game.move(move)
      if (result?.captured) sound.play('capture')
      else if (result) sound.play('move')
      setTick((t) => t + 1)
      setPhase({ kind: 'playing' })
    } catch (err) {
      console.error('endgame: engine move failed', err)
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [opponent, preset.settings, game, sound])

  const handleMove = useCallback(
    (input: MoveInput) => {
      if (phase.kind !== 'playing') return
      if (game.turn() !== PLAYER_COLOR) return
      const result = game.move(input)
      if (!result) return
      if (result.captured) sound.play('capture')
      else sound.play('move')
      setMoveCount((n) => n + 1)
      setTick((t) => t + 1)
      // If the player's move ended the game, the status useEffect picks
      // it up. Otherwise hand the turn to the engine.
      const nextStatus = game.status()
      if (nextStatus.kind === 'in_progress') {
        void playAi()
      }
    },
    [phase.kind, game, sound, playAi],
  )

  const reset = useCallback(() => {
    if (!lesson) return
    cancelledRef.current = false
    setGame(new ChessGame(lesson.startFen))
    setMoveCount(0)
    setTick((t) => t + 1)
    setPhase({ kind: 'playing' })
  }, [lesson])

  useEffect(() => {
    return () => {
      cancelledRef.current = true
    }
  }, [])

  if (!lesson) {
    return (
      <div className="puc-egl puc-egl--centered">
        <p>Unknown lesson.</p>
        <button
          type="button"
          className="puc-egl__btn"
          onClick={() => navigate('/endgame')}
        >
          Back to drills
        </button>
      </div>
    )
  }

  const playerTurn = game.turn() === PLAYER_COLOR && phase.kind === 'playing'
  const thinking = phase.kind === 'thinking'

  return (
    <div className="puc-egl">
      <header className="puc-egl__header">
        <button
          type="button"
          className="puc-egl__back"
          onClick={() => navigate('/endgame')}
          aria-label="Back to drills"
        >
          ←
        </button>
        <div className="puc-egl__title-wrap">
          <h1 className="puc-egl__title">{lesson.title}</h1>
          <p className="puc-egl__sub">{lesson.pieceSummary}</p>
        </div>
        <div className="puc-egl__counter" aria-label="Moves played">
          <span className="puc-egl__counter-label">Moves</span>
          <span className="puc-egl__counter-num">{moveCount}</span>
          <span className="puc-egl__counter-par">/ par {lesson.parMoves}</span>
        </div>
      </header>

      <main className="puc-egl__main">
        <aside className="puc-egl__brief">
          <h2 className="puc-egl__brief-head">Goal</h2>
          <p className="puc-egl__brief-body">{lesson.goal}</p>
          <h2 className="puc-egl__brief-head">Technique</h2>
          <p className="puc-egl__brief-body">{lesson.technique}</p>
          <div className="puc-egl__status">
            {phase.kind === 'loading' && <span>Booting engine…</span>}
            {thinking && <span>Defender thinking…</span>}
            {playerTurn && status.kind === 'in_progress' && (
              <span>
                Your move{status.inCheck ? ' — defender in check!' : '.'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="puc-egl__btn puc-egl__btn--ghost"
            onClick={reset}
          >
            Restart drill
          </button>
        </aside>

        <div className="puc-egl__board-wrap">
          <Board
            pieces={pieces}
            turn={game.turn()}
            orientation={PLAYER_COLOR}
            legalDestinationsFrom={legalDestinationsFrom}
            onMove={handleMove}
            lastMove={lastMove}
            checkSquare={checkSquare}
            squareSize={SQUARE_SIZE}
          />
        </div>
      </main>

      {phase.kind === 'cleared' && (
        <div className="puc-egl__overlay puc-egl__overlay--ok">
          <h2 className="puc-egl__overlay-title">Checkmate!</h2>
          <p className="puc-egl__overlay-body">
            Cleared in {phase.moves} moves (par {lesson.parMoves}). Try a
            different starting position once more arrive.
          </p>
          <div className="puc-egl__overlay-actions">
            <button
              type="button"
              className="puc-egl__btn"
              onClick={() => navigate('/endgame')}
            >
              Back to drills
            </button>
            <button
              type="button"
              className="puc-egl__btn puc-egl__btn--primary"
              onClick={reset}
            >
              Drill again
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="puc-egl__overlay puc-egl__overlay--fail">
          <h2 className="puc-egl__overlay-title">
            {phase.reason === 'stalemate' ? 'Stalemate' : 'Draw'}
          </h2>
          <p className="puc-egl__overlay-body">
            The defender escaped — that&apos;s a {phase.reason}. Reset and try
            a tighter technique.
          </p>
          <div className="puc-egl__overlay-actions">
            <button
              type="button"
              className="puc-egl__btn"
              onClick={() => navigate('/endgame')}
            >
              Back to drills
            </button>
            <button
              type="button"
              className="puc-egl__btn puc-egl__btn--primary"
              onClick={reset}
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="puc-egl__overlay puc-egl__overlay--fail">
          <h2 className="puc-egl__overlay-title">Engine error</h2>
          <p className="puc-egl__overlay-body">{phase.message}</p>
          <div className="puc-egl__overlay-actions">
            <button
              type="button"
              className="puc-egl__btn"
              onClick={() => navigate('/endgame')}
            >
              Back to drills
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
