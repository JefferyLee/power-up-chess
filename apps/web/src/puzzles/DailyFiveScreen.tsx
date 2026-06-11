// DailyFiveScreen — guided 5-puzzle daily quest.
//
// Reuses the standard solve loop (Board + chess.js + submitPuzzleAttempt
// callable). On submit the server marks the slot in puzzleDaily.results
// and fires the +10 completion bonus on the 5th attempt.
//
// On open we always re-fetch via getDailyFive: if the day has rolled
// over the server picks a fresh set; otherwise it returns the existing
// slate + current results.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'

/* three.js chunk — fetched only on first 3D flip (shared with the
 * game screens). */
const Board3D = lazy(() =>
  import('../board3d/Board3D').then((m) => ({ default: m.Board3D })),
)
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import { useSound } from '../sound/useSound'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useCastle } from '../castle/useCastle'
import { useAuthUid } from '../auth/useAuthUid'
import {
  callGetDailyFive,
  callSubmitPuzzleAttempt,
  type ServerPuzzle,
} from '../firebase/callables'
import './DailyFiveScreen.css'

const MAX_SQUARE_SIZE = 56

type Phase =
  | { kind: 'loading' }
  | { kind: 'playing' }
  | { kind: 'between'; success: boolean; rating: { before: number; after: number }; pointsAdded: number; bonusAdded: number; completedNow: boolean }
  | { kind: 'done'; bonusPaid: boolean }
  | { kind: 'error'; message: string }

export function DailyFiveScreen() {
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, setCastlePoints } = useCastle()
  const authState = useAuthUid()
  const authReady = authState.status === 'ready'
  const normalizedName = identity?.normalizedName ?? ''
  const canPlay = !!identity && !identity.isBypass

  // 3D view — same legality/judging flow, different renderer.
  const [view3d, setView3d] = useState(false)
  const [puzzles, setPuzzles] = useState<ServerPuzzle[]>([])
  const [results, setResults] = useState<Array<boolean | null>>([])
  const [completionBonusPaid, setCompletionBonusPaid] = useState(false)
  const [idx, setIdx] = useState(0)
  const [game, setGame] = useState<ChessGame>(() => new ChessGame())
  const [moveIndex, setMoveIndex] = useState(0)
  const [shake, setShake] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const startedAtRef = useRef<number | null>(null)

  // Initial fetch.
  useEffect(() => {
    if (!authReady) return
    if (!canPlay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({
        kind: 'error',
        message: "Today's Five is for signed-in guests with a magic word.",
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await callGetDailyFive({ normalizedName })
        if (cancelled) return
        if (!res.ok) {
          setPhase({ kind: 'error', message: 'No puzzles for today.' })
          return
        }
        setPuzzles(res.puzzles)
        setResults(res.results)
        setCompletionBonusPaid(res.completionBonusPaid)
        // Start at the first not-yet-attempted slot, or 0.
        const first = Math.max(
          0,
          res.results.findIndex((r) => r === null || r === undefined),
        )
        const startAt = first === -1 ? 0 : first
        const allDone = res.results.every((r) => r !== null && r !== undefined)
        if (allDone) {
          setPhase({ kind: 'done', bonusPaid: res.completionBonusPaid })
          return
        }
        setIdx(startAt)
        setGame(new ChessGame(res.puzzles[startAt]!.fen))
        setMoveIndex(0)
        setPhase({ kind: 'playing' })
      } catch (err) {
        console.error('getDailyFive failed:', err)
        if (cancelled) return
        setPhase({ kind: 'error', message: 'Could not load today\'s puzzles.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, canPlay, normalizedName])

  const current = puzzles[idx]
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

  const submit = useCallback(
    async (success: boolean) => {
      if (!current) return
      const timeMs = startedAtRef.current
        ? Date.now() - startedAtRef.current
        : 0
      try {
        const res = await callSubmitPuzzleAttempt({
          normalizedName,
          puzzleId: current.id,
          success,
          timeMs,
        })
        if (res.castlePointsAdded > 0) setCastlePoints(res.castlePoints)
        const newResults = [...results]
        newResults[idx] = success
        setResults(newResults)
        if (res.dailyCompletedNow) setCompletionBonusPaid(true)
        setPhase({
          kind: 'between',
          success,
          rating: { before: res.ratingBefore, after: res.ratingAfter },
          pointsAdded: (res.castlePointsAdded ?? 0) - (res.dailyBonusAdded ?? 0),
          bonusAdded: res.dailyBonusAdded ?? 0,
          completedNow: res.dailyCompletedNow === true,
        })
      } catch (err) {
        console.error('submitPuzzleAttempt failed:', err)
        setPhase({ kind: 'error', message: 'Could not save that attempt.' })
      }
    },
    [current, normalizedName, results, idx, setCastlePoints],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!current || phase.kind !== 'playing') return
      if (startedAtRef.current === null) startedAtRef.current = Date.now()
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
      if (nextIdx < current.solution.length) {
        const reply = parseUci(current.solution[nextIdx]!)
        window.setTimeout(() => {
          const r = game.move(reply)
          if (r?.captured) sound.play('capture')
          else if (r) sound.play('move')
          setMoveIndex(nextIdx + 1)
          if (nextIdx + 1 >= current.solution.length) {
            void submit(true)
          }
        }, 320)
        setMoveIndex(nextIdx)
        return
      }
      setMoveIndex(nextIdx)
      void submit(true)
    },
    [current, phase.kind, moveIndex, game, sound, submit],
  )

  const onSkip = useCallback(() => {
    if (!current || phase.kind !== 'playing') return
    void submit(false)
  }, [current, phase.kind, submit])

  const advance = useCallback(() => {
    if (idx + 1 >= puzzles.length) {
      setPhase({ kind: 'done', bonusPaid: completionBonusPaid })
      return
    }
    const next = idx + 1
    setIdx(next)
    setGame(new ChessGame(puzzles[next]!.fen))
    setMoveIndex(0)
    startedAtRef.current = null
    setPhase({ kind: 'playing' })
  }, [idx, puzzles, completionBonusPaid])

  // ── render ───────────────────────────────────────────────────────────

  if (phase.kind === 'loading') {
    return (
      <div className="puc-daily puc-daily--centered">
        <p>Loading today&apos;s puzzles…</p>
      </div>
    )
  }
  if (phase.kind === 'error') {
    return (
      <div className="puc-daily puc-daily--centered">
        <p className="puc-daily__error">{phase.message}</p>
        <button
          type="button"
          className="puc-daily__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (phase.kind === 'done') {
    const solved = results.filter((r) => r === true).length
    return (
      <div className="puc-daily puc-daily--centered">
        <h1 className="puc-daily__done-title">Today&apos;s Five is done!</h1>
        <p className="puc-daily__done-sub">
          You solved <strong>{solved}</strong> of {puzzles.length}.
        </p>
        {phase.bonusPaid && (
          <p className="puc-daily__done-bonus">
            +10 castle-point completion bonus
          </p>
        )}
        <button
          type="button"
          className="puc-daily__btn puc-daily__btn--primary"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden →
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="puc-daily puc-daily--centered">
        <p>Loading puzzle…</p>
      </div>
    )
  }

  const sideToMoveLabel = current.sideToMove === 'w' ? 'White' : 'Black'

  return (
    <div className="puc-daily">
      <header className="puc-daily__header">
        <button
          type="button"
          className="puc-daily__back"
          onClick={() => navigate('/puzzles')}
          aria-label="Back to garden"
        >
          ←
        </button>
        <div className="puc-daily__title-wrap">
          <h1 className="puc-daily__title">Today&apos;s Five</h1>
          <p className="puc-daily__sub">
            Five hand-picked puzzles, ramping easy to hard.
          </p>
        </div>
      </header>

      <div className="puc-daily__steps" aria-label="Today's Five progress">
        {puzzles.map((_, i) => (
          <span
            key={i}
            className={
              'puc-daily__step ' +
              (results[i] === true
                ? 'puc-daily__step--solved'
                : results[i] === false
                  ? 'puc-daily__step--failed'
                  : i === idx
                    ? 'puc-daily__step--current'
                    : 'puc-daily__step--pending')
            }
          />
        ))}
      </div>

      <div className="puc-daily__main">
        <div
          className={
            'puc-daily__board' +
            (shake ? ' puc-daily__board--shake' : '') +
            (view3d ? ' puc-daily__board--3d' : '')
          }
        >
          {view3d ? (
            <Suspense
              fallback={<div className="puc-daily__board3d-loading">Carving the 3D board…</div>}
            >
              <Board3D
                pieces={pieces}
                turn={game.turn()}
                legalDestinationsFrom={legalDestinationsFrom}
                onMove={handleMove}
                lastMove={lastMove}
                checkSquare={checkSquare}
                initialSide={current.sideToMove}
              />
            </Suspense>
          ) : (
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
          )}
        </div>

        <aside className="puc-daily__side">
          <div className="puc-daily__puzzleinfo">
            <div className="puc-daily__row">
              <span>Puzzle</span>
              <strong>
                {idx + 1} / {puzzles.length}
              </strong>
            </div>
            <div className="puc-daily__row">
              <span>Rating</span>
              <strong>{current.difficulty}</strong>
            </div>
            <div className="puc-daily__row">
              <span>Plot</span>
              <strong>{current.plot}</strong>
            </div>
            <div className="puc-daily__row">
              <span>To move</span>
              <strong>{sideToMoveLabel}</strong>
            </div>
          </div>

          <button
            type="button"
            className={'puc-daily__btn' + (view3d ? ' puc-daily__btn--on' : '')}
            onClick={() => setView3d((v) => !v)}
            aria-pressed={view3d}
            title={view3d ? 'Back to the flat board' : 'Solve on the 3D board'}
          >
            {view3d ? '🎲 2D board' : '🎲 3D board'}
          </button>

          {phase.kind === 'playing' && (
            <button
              type="button"
              className="puc-daily__btn puc-daily__btn--skip"
              onClick={onSkip}
            >
              Skip →
            </button>
          )}

          {phase.kind === 'between' && (
            <div
              className={
                'puc-daily__result ' +
                (phase.success
                  ? 'puc-daily__result--ok'
                  : 'puc-daily__result--fail')
              }
            >
              <p className="puc-daily__result-head">
                {phase.success ? 'Solved!' : 'Skipped'}
              </p>
              <p className="puc-daily__result-delta">
                {phase.rating.before} → <strong>{phase.rating.after}</strong>
              </p>
              {phase.pointsAdded > 0 && (
                <p className="puc-daily__result-points">
                  +{phase.pointsAdded} castle points
                </p>
              )}
              {phase.completedNow && phase.bonusAdded > 0 && (
                <p className="puc-daily__result-bonus">
                  + {phase.bonusAdded} daily-completion bonus 🎉
                </p>
              )}
              <button
                type="button"
                className="puc-daily__btn puc-daily__btn--primary"
                onClick={advance}
              >
                {idx + 1 >= puzzles.length ? 'See results →' : 'Next →'}
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
