// EndgameLessonScreen — play through a multi-position endgame drill
// (P2.K Slice 2).
//
// Each lesson is a bag of 1+ positions on the same technique. Clear
// one → "Next position →" advances; final position → lesson mastered.
// Player is White; Stockfish (hard) plays the lone king as defender.
//
// Two engines run side by side: the "defender" engine that picks
// black's reply, and a separate "hint" engine queried at expert
// depth when the kid asks for help. Keeping them apart avoids the
// "AiOpponent is already computing" race when a hint is requested
// mid-thinking.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board, type BoardArrow } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { Color, MoveInput, Square } from '../chess/types'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useSound } from '../sound/useSound'
import { AiOpponent } from '../ai/AiOpponent'
import { difficultyById } from '../ai/difficulty'
import { useCastle } from '../castle/useCastle'
import { callSubmitEndgameClear } from '../firebase/callables'
import { track } from '../firebase/analytics'
import { getLesson, type Lesson } from './lessons'
import './EndgameLessonScreen.css'

const MAX_SQUARE_SIZE = 72
const PLAYER_COLOR: Color = 'w'

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing' }
  | { kind: 'thinking' }
  | { kind: 'cleared'; moves: number }
  | { kind: 'failed'; reason: 'stalemate' | 'draw'; moves: number }
  | { kind: 'error'; message: string }

interface Award {
  pointsAdded: number
  lessonMasteredNow: boolean
}

export function EndgameLessonScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const lesson = useMemo(() => getLesson(id), [id])
  const { identity, setCastlePoints } = useCastle()
  const [award, setAward] = useState<Award | null>(null)
  const awardedKeyRef = useRef<string | null>(null)

  // Two Stockfish workers: one to drive the defender (hard tier so
  // the lone king plays best), one to answer hint requests (expert
  // tier for the strongest "what would you do?" suggestion).
  const [defender] = useState(() => new AiOpponent())
  const [hintEngine] = useState(() => new AiOpponent())
  const defenderPreset = difficultyById('hard')
  const hintPreset = difficultyById('expert')
  useEffect(() => {
    return () => {
      defender.terminate()
      hintEngine.terminate()
    }
  }, [defender, hintEngine])

  // Round = which position in the bag we're playing.
  const [round, setRound] = useState(0)
  const current = lesson?.positions[round] ?? null

  const [game, setGame] = useState<ChessGame>(() =>
    current ? new ChessGame(current.fen) : new ChessGame(),
  )
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [moveCount, setMoveCount] = useState(0)
  // Tick: bumped after every applied move so derived board state
  // (fen, pieces, status) recomputes — ChessGame mutates in place.
  const [tick, setTick] = useState(0)
  const [hint, setHint] = useState<BoardArrow | null>(null)
  const [hintBusy, setHintBusy] = useState(false)
  const cancelledRef = useRef(false)

  // Boot: wait for the defender engine to be ready, then enter
  // playing phase. Hint engine boots in parallel but we don't gate
  // on it — the player can start playing before the hint button
  // becomes usable.
  useEffect(() => {
    if (!lesson) return
    let cancelled = false
    defender
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
  }, [defender, lesson])

  // Reset state whenever we change rounds.
  useEffect(() => {
    if (!current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(new ChessGame(current.fen))
    setMoveCount(0)
    setHint(null)
    setAward(null)
    setTick((t) => t + 1)
    // If the defender engine has booted already, drop straight back
    // into playing; otherwise the boot effect above flips us in.
    if (phase.kind !== 'loading') {
      setPhase({ kind: 'playing' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, current])

  // Submit the clear once per (lesson, position) — the server also
  // dedupes, but we don't want to fire the callable on every render
  // while the overlay is visible.
  useEffect(() => {
    if (phase.kind !== 'cleared') return
    if (!lesson || !current) return
    if (!identity || identity.isBypass || !identity.sessionId) return
    const key = `${lesson.id}:${current.label}`
    if (awardedKeyRef.current === key) return
    awardedKeyRef.current = key
    let cancelled = false
    track('endgame_position_clear', {
      lesson_id: lesson.id,
      position_label: current.label,
    })
    void callSubmitEndgameClear({
      normalizedName: identity.normalizedName,
      sessionId: identity.sessionId,
      lessonId: lesson.id,
      positionLabel: current.label,
    })
      .then((res) => {
        if (cancelled) return
        if (res.pointsAdded > 0) setCastlePoints(res.castlePoints)
        setAward({
          pointsAdded: res.pointsAdded,
          lessonMasteredNow: res.lessonMasteredNow,
        })
      })
      .catch((err) => {
        console.warn('submitEndgameClear failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [phase.kind, lesson, current, identity, setCastlePoints])

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

  // Translate terminal chess.js status into a phase transition.
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

  const playDefender = useCallback(async () => {
    if (cancelledRef.current) return
    setPhase({ kind: 'thinking' })
    try {
      const uci = await defender.pickMove(game.fen(), defenderPreset.settings)
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
      console.error('endgame: defender move failed', err)
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [defender, defenderPreset.settings, game, sound])

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
      setHint(null) // stale once the position changes
      const nextStatus = game.status()
      if (nextStatus.kind === 'in_progress') {
        void playDefender()
      }
    },
    [phase.kind, game, sound, playDefender],
  )

  const askForHint = useCallback(async () => {
    if (phase.kind !== 'playing') return
    if (game.turn() !== PLAYER_COLOR) return
    setHintBusy(true)
    try {
      const uci = await hintEngine.pickMove(game.fen(), hintPreset.settings)
      if (cancelledRef.current) return
      setHint({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
      })
    } catch (err) {
      console.warn('endgame: hint failed', err)
    } finally {
      setHintBusy(false)
    }
  }, [hintEngine, hintPreset.settings, phase.kind, game])

  const restartPosition = useCallback(() => {
    if (!current) return
    cancelledRef.current = false
    setGame(new ChessGame(current.fen))
    setMoveCount(0)
    setHint(null)
    setTick((t) => t + 1)
    setPhase({ kind: 'playing' })
  }, [current])

  const nextPosition = useCallback(() => {
    if (!lesson) return
    if (round + 1 < lesson.positions.length) {
      setRound((r) => r + 1)
    }
  }, [lesson, round])

  const restartLesson = useCallback(() => {
    setRound(0)
  }, [])

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

  const total = lesson.positions.length
  const isFinalRound = round === total - 1
  const playerTurn = game.turn() === PLAYER_COLOR && phase.kind === 'playing'
  const thinking = phase.kind === 'thinking'
  const hintArrows: BoardArrow[] = hint
    ? [{ from: hint.from, to: hint.to, color: 'rgba(140, 170, 240, 0.85)' }]
    : []

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
          <p className="puc-egl__sub">
            {lesson.pieceSummary} · {current?.label ?? ''}
          </p>
        </div>
        <div className="puc-egl__round" aria-label="Round">
          <span className="puc-egl__round-label">Round</span>
          <span className="puc-egl__round-num">{round + 1}</span>
          <span className="puc-egl__round-of">/ {total}</span>
        </div>
        <div className="puc-egl__counter" aria-label="Moves played">
          <span className="puc-egl__counter-label">Moves</span>
          <span className="puc-egl__counter-num">{moveCount}</span>
          <span className="puc-egl__counter-par">/ par {current?.parMoves ?? 0}</span>
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
          <div className="puc-egl__actions">
            <button
              type="button"
              className="puc-egl__btn puc-egl__btn--hint"
              onClick={askForHint}
              disabled={!playerTurn || hintBusy}
            >
              {hintBusy ? 'Thinking…' : hint ? 'Hint shown' : '💡 Hint'}
            </button>
            <button
              type="button"
              className="puc-egl__btn puc-egl__btn--ghost"
              onClick={restartPosition}
            >
              Restart position
            </button>
          </div>
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
            arrows={hintArrows}
          />
        </div>
      </main>

      {phase.kind === 'cleared' && (
        <ClearedOverlay
          lesson={lesson}
          moves={phase.moves}
          par={current?.parMoves ?? 0}
          isFinalRound={isFinalRound}
          award={award}
          onNext={nextPosition}
          onRestart={restartLesson}
          onExit={() => navigate('/endgame')}
        />
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
              onClick={restartPosition}
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

function ClearedOverlay({
  lesson,
  moves,
  par,
  isFinalRound,
  award,
  onNext,
  onRestart,
  onExit,
}: {
  lesson: Lesson
  moves: number
  par: number
  isFinalRound: boolean
  award: Award | null
  onNext: () => void
  onRestart: () => void
  onExit: () => void
}) {
  const underPar = moves <= par
  const showMasteredHeader = isFinalRound && (award?.lessonMasteredNow ?? true)
  return (
    <div className="puc-egl__overlay puc-egl__overlay--ok">
      <h2 className="puc-egl__overlay-title">
        {showMasteredHeader ? 'Lesson mastered ✓' : 'Position cleared ✓'}
      </h2>
      <p className="puc-egl__overlay-body">
        {underPar
          ? `${moves} moves (under par ${par}). Tight technique.`
          : `${moves} moves (par ${par}). Walked the king down — the principle is the same.`}{' '}
        {isFinalRound
          ? `You've cleared every ${lesson.pieceSummary.toLowerCase()} drill in this lesson.`
          : 'Next position is a slightly different starting setup.'}
      </p>
      {award && award.pointsAdded > 0 && (
        <div className="puc-egl__overlay-award">
          <span className="puc-egl__overlay-award-num">
            +{award.pointsAdded}
          </span>
          <span className="puc-egl__overlay-award-label">
            castle points{award.lessonMasteredNow ? ' (mastery bonus!)' : ''}
          </span>
        </div>
      )}
      {award && award.pointsAdded === 0 && (
        <p className="puc-egl__overlay-already">
          Already cleared — no new points, just practice. 🏰
        </p>
      )}
      <div className="puc-egl__overlay-actions">
        <button type="button" className="puc-egl__btn" onClick={onExit}>
          Back to drills
        </button>
        {isFinalRound ? (
          <button
            type="button"
            className="puc-egl__btn puc-egl__btn--primary"
            onClick={onRestart}
          >
            Run lesson again
          </button>
        ) : (
          <button
            type="button"
            className="puc-egl__btn puc-egl__btn--primary"
            onClick={onNext}
          >
            Next position →
          </button>
        )}
      </div>
    </div>
  )
}
