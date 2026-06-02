// CalibrationScreen — 5-puzzle onboarding ladder.
//
// The server's getCalibrationSet returns 5 puzzles at ratings
// [300, 500, 700, 1000, 1300] across mixed plots. We walk the kid
// through them one at a time, tracking pass/fail. After the last
// puzzle we post the boolean[] to submitCalibration, which writes a
// single seed rating to every plot on the guest doc.
//
// Wrong moves don't penalise — they're just feedback. The kid clicks
// "I solved it" once the board shows the final position, or "Give up"
// to mark the puzzle as failed and move on.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import { useSound } from '../sound/useSound'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useCastle } from '../castle/useCastle'
import { useAuthUid } from '../auth/useAuthUid'
import {
  callGetCalibrationSet,
  callSubmitCalibration,
  type ServerPuzzle,
} from '../firebase/callables'
import './CalibrationScreen.css'

const MAX_SQUARE_SIZE = 56

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing' }
  | { kind: 'submitting' }
  | { kind: 'done'; seedRating: number; solvedCount: number }
  | { kind: 'error'; message: string }

export function CalibrationScreen() {
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity } = useCastle()
  const authState = useAuthUid()
  const authReady = authState.status === 'ready'
  const normalizedName = identity?.normalizedName ?? ''
  const canCalibrate = !!identity && !identity.isBypass

  const [puzzles, setPuzzles] = useState<ServerPuzzle[]>([])
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<boolean[]>([])
  const [game, setGame] = useState<ChessGame>(() => new ChessGame())
  const [moveIndex, setMoveIndex] = useState(0)
  const [shake, setShake] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const submittedRef = useRef(false)

  const current = puzzles[idx]

  // Initial load.
  useEffect(() => {
    if (!authReady) return
    if (!canCalibrate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({
        kind: 'error',
        message:
          'Calibration is for signed-in guests with a magic word. Bypass guests don\'t have a saved rating.',
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await callGetCalibrationSet({ normalizedName })
        if (cancelled) return
        if (!res.ok) {
          setPhase({ kind: 'error', message: 'No calibration puzzles available.' })
          return
        }
        setPuzzles(res.puzzles)
        setIdx(0)
        setResults([])
        setGame(new ChessGame(res.puzzles[0]!.fen))
        setMoveIndex(0)
        setPhase({ kind: 'playing' })
      } catch (err) {
        console.error('getCalibrationSet failed:', err)
        if (cancelled) return
        setPhase({
          kind: 'error',
          message: 'Could not load calibration puzzles. Try again later.',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, canCalibrate, normalizedName])

  const fen = current ? game.fen() : ''
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

  // Advance to the next calibration puzzle, or submit if we're done.
  const advance = useCallback(
    async (allResults: boolean[]) => {
      const nextIdx = allResults.length
      if (nextIdx < puzzles.length) {
        setIdx(nextIdx)
        setGame(new ChessGame(puzzles[nextIdx]!.fen))
        setMoveIndex(0)
        setPhase({ kind: 'playing' })
        return
      }
      // Submit.
      if (submittedRef.current) return
      submittedRef.current = true
      setPhase({ kind: 'submitting' })
      try {
        const res = await callSubmitCalibration({
          normalizedName,
          results: allResults,
        })
        const solvedCount = allResults.filter(Boolean).length
        setPhase({ kind: 'done', seedRating: res.seedRating, solvedCount })
      } catch (err) {
        console.error('submitCalibration failed:', err)
        setPhase({
          kind: 'error',
          message: 'Could not save your calibration. Try again later.',
        })
      }
    },
    [puzzles, normalizedName],
  )

  const recordResult = useCallback(
    (success: boolean) => {
      const next = [...results, success]
      setResults(next)
      void advance(next)
    },
    [results, advance],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!current || phase.kind !== 'playing') return
      const expected = current.solution[moveIndex]
      if (!expected) return
      const expectedMove = parseUci(expected)
      const isCorrect =
        move.from === expectedMove.from &&
        move.to === expectedMove.to &&
        (move.promotion ?? 'q') === (expectedMove.promotion ?? 'q')
      if (!isCorrect) {
        setShake(true)
        window.setTimeout(() => setShake(false), 400)
        return
      }
      const applied = game.move(expectedMove)
      if (!applied) return
      if (applied.captured) sound.play('capture')
      else sound.play('move')
      const nextIdx = moveIndex + 1
      // Auto-play opponent reply if scripted.
      if (nextIdx < current.solution.length) {
        const reply = parseUci(current.solution[nextIdx]!)
        window.setTimeout(() => {
          const r = game.move(reply)
          if (r?.captured) sound.play('capture')
          else if (r) sound.play('move')
          setMoveIndex(nextIdx + 1)
          if (nextIdx + 1 >= current.solution.length) {
            recordResult(true)
          }
        }, 320)
        setMoveIndex(nextIdx)
        return
      }
      setMoveIndex(nextIdx)
      recordResult(true)
    },
    [current, phase.kind, moveIndex, game, sound, recordResult],
  )

  const onGiveUp = useCallback(() => {
    if (!current || phase.kind !== 'playing') return
    recordResult(false)
  }, [current, phase.kind, recordResult])

  // ── Render ────────────────────────────────────────────────────────────

  if (phase.kind === 'loading') {
    return (
      <div className="puc-cal puc-cal--centered">
        <p>Preparing your calibration…</p>
      </div>
    )
  }
  if (phase.kind === 'error') {
    return (
      <div className="puc-cal puc-cal--centered">
        <p className="puc-cal__error">{phase.message}</p>
        <button
          type="button"
          className="puc-cal__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (phase.kind === 'done') {
    return (
      <div className="puc-cal puc-cal--centered">
        <h1 className="puc-cal__done-title">Welcome to the garden!</h1>
        <p className="puc-cal__done-sub">
          You solved <strong>{phase.solvedCount}</strong> of {puzzles.length}.
        </p>
        <p className="puc-cal__done-rating">
          Starting rating
          <span className="puc-cal__seed">{phase.seedRating}</span>
        </p>
        <button
          type="button"
          className="puc-cal__btn puc-cal__btn--primary"
          onClick={() => navigate('/puzzles')}
        >
          Enter the garden →
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="puc-cal puc-cal--centered">
        <p>Loading puzzle…</p>
      </div>
    )
  }

  const sideToMoveLabel = current.sideToMove === 'w' ? 'White' : 'Black'

  return (
    <div className="puc-cal">
      <header className="puc-cal__header">
        <button
          type="button"
          className="puc-cal__back"
          onClick={() => navigate('/puzzles')}
          aria-label="Back to garden"
        >
          ←
        </button>
        <div className="puc-cal__title-wrap">
          <h1 className="puc-cal__title">Calibration</h1>
          <p className="puc-cal__sub">
            5 puzzles to find your starting level. Solve what you can; skip what
            you can&apos;t.
          </p>
        </div>
      </header>

      <div className="puc-cal__steps" aria-label="Calibration progress">
        {puzzles.map((_, i) => (
          <span
            key={i}
            className={
              'puc-cal__step ' +
              (i < results.length
                ? results[i]
                  ? 'puc-cal__step--solved'
                  : 'puc-cal__step--failed'
                : i === idx
                  ? 'puc-cal__step--current'
                  : 'puc-cal__step--pending')
            }
            aria-label={
              i < results.length
                ? results[i]
                  ? 'Solved'
                  : 'Skipped'
                : i === idx
                  ? 'Now'
                  : 'Pending'
            }
          />
        ))}
      </div>

      <div className="puc-cal__main">
        <div
          className={`puc-cal__board ${shake ? 'puc-cal__board--shake' : ''}`}
        >
          <Board
            pieces={pieces}
            turn={game.turn()}
            orientation={current.sideToMove}
            legalDestinationsFrom={legalDestinationsFrom}
            onMove={handleMove}
            lastMove={lastMove}
            checkSquare={checkSquare}
            squareSize={SQUARE_SIZE}
          />
        </div>

        <aside className="puc-cal__side">
          <div className="puc-cal__puzzleinfo">
            <div className="puc-cal__row">
              <span>Puzzle</span>
              <strong>
                {idx + 1} / {puzzles.length}
              </strong>
            </div>
            <div className="puc-cal__row">
              <span>Rating</span>
              <strong>{current.difficulty}</strong>
            </div>
            <div className="puc-cal__row">
              <span>To move</span>
              <strong>{sideToMoveLabel}</strong>
            </div>
            <div className="puc-cal__row">
              <span>Motif</span>
              <strong>{current.motifs[0] ?? '—'}</strong>
            </div>
          </div>

          {phase.kind === 'playing' && (
            <button
              type="button"
              className="puc-cal__btn puc-cal__btn--skip"
              onClick={onGiveUp}
            >
              I can&apos;t solve this — skip →
            </button>
          )}

          {phase.kind === 'submitting' && (
            <p className="puc-cal__note">Saving your rating…</p>
          )}
        </aside>
      </div>
    </div>
  )
}
