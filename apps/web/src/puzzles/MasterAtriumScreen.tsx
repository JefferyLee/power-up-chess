// MasterAtriumScreen — challenge tier museum of every 2500-3000 rated
// puzzle. Structurally identical to LegendsHallScreen but pulls
// getMasterAtriumList; the gate is lower (25 solves vs 50) so it sits
// as a step before Legends Hall.

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
  callGetMasterAtriumList,
  callSubmitPuzzleAttempt,
  type ServerPuzzle,
} from '../firebase/callables'
import './MasterAtriumScreen.css'

const MAX_SQUARE_SIZE = 56

type View =
  | { kind: 'loading' }
  | { kind: 'locked'; solved: number; threshold: number }
  | { kind: 'gallery'; puzzles: ServerPuzzle[]; solved: Set<string> }
  | { kind: 'playing'; puzzle: ServerPuzzle; result: PlayResult | null }
  | { kind: 'error'; message: string }

interface PlayResult {
  success: boolean
  ratingBefore: number
  ratingAfter: number
  pointsAdded: number
}

export function MasterAtriumScreen() {
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, setCastlePoints } = useCastle()
  const authState = useAuthUid()
  const authReady = authState.status === 'ready'
  const normalizedName = identity?.normalizedName ?? ''

  const [view, setView] = useState<View>({ kind: 'loading' })
  const [allPuzzles, setAllPuzzles] = useState<ServerPuzzle[]>([])
  const [solvedSet, setSolvedSet] = useState<Set<string>>(new Set())
  const [game, setGame] = useState<ChessGame>(() => new ChessGame())
  const [moveIndex, setMoveIndex] = useState(0)
  const [shake, setShake] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!authReady) return
    if (!identity || identity.isBypass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView({
        kind: 'error',
        message: "Master's Atrium is for signed-in guests with a magic word.",
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await callGetMasterAtriumList({ normalizedName })
        if (cancelled) return
        if (res.totalSolved < res.unlockThreshold) {
          setView({
            kind: 'locked',
            solved: res.totalSolved,
            threshold: res.unlockThreshold,
          })
          return
        }
        const solved = new Set(res.solved)
        setAllPuzzles(res.puzzles)
        setSolvedSet(solved)
        setView({ kind: 'gallery', puzzles: res.puzzles, solved })
      } catch (err) {
        console.error('getMasterAtriumList failed:', err)
        if (cancelled) return
        setView({ kind: 'error', message: "Could not load Master's Atrium." })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, identity, normalizedName])

  const current = view.kind === 'playing' ? view.puzzle : null
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
      view.kind === 'playing' && view.result === null
        ? game.legalDestinationsFrom(from)
        : [],
    [game, view],
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
        if (success) {
          const next = new Set(solvedSet)
          next.add(current.id)
          setSolvedSet(next)
        }
        setView({
          kind: 'playing',
          puzzle: current,
          result: {
            success,
            ratingBefore: res.ratingBefore,
            ratingAfter: res.ratingAfter,
            pointsAdded: res.castlePointsAdded,
          },
        })
      } catch (err) {
        console.error('submitPuzzleAttempt failed:', err)
      }
    },
    [current, normalizedName, solvedSet, setCastlePoints],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!current || view.kind !== 'playing' || view.result !== null) return
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
    [current, view, moveIndex, game, sound, submit],
  )

  const playPlaque = useCallback((puzzle: ServerPuzzle) => {
    setGame(new ChessGame(puzzle.fen))
    setMoveIndex(0)
    startedAtRef.current = null
    setView({ kind: 'playing', puzzle, result: null })
  }, [])

  const backToGallery = useCallback(() => {
    setView({ kind: 'gallery', puzzles: allPuzzles, solved: solvedSet })
  }, [allPuzzles, solvedSet])

  if (view.kind === 'loading') {
    return (
      <div className="puc-master puc-master--centered">
        <p>Opening the Master&apos;s Atrium…</p>
      </div>
    )
  }
  if (view.kind === 'error') {
    return (
      <div className="puc-master puc-master--centered">
        <p className="puc-master__error">{view.message}</p>
        <button
          type="button"
          className="puc-master__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (view.kind === 'locked') {
    return (
      <div className="puc-master puc-master--centered">
        <div className="puc-master__locked-icon">🔒</div>
        <h1 className="puc-master__locked-title">Master&apos;s Atrium is locked</h1>
        <p className="puc-master__locked-blurb">
          Solve {view.threshold - view.solved} more puzzles to step inside.
          {' '}You&apos;ve solved <strong>{view.solved}</strong> so far.
        </p>
        <button
          type="button"
          className="puc-master__btn puc-master__btn--primary"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (view.kind === 'gallery') {
    const earned = view.puzzles.filter((p) => view.solved.has(p.id)).length
    return (
      <div className="puc-master">
        <header className="puc-master__header">
          <button
            type="button"
            className="puc-master__back"
            onClick={() => navigate('/puzzles')}
            aria-label="Back to garden"
          >
            ←
          </button>
          <h1 className="puc-master__title">Master&apos;s Atrium</h1>
          <div className="puc-master__meta">
            <span className="puc-master__meta-label">Touched</span>
            <span className="puc-master__meta-value">
              {earned} / {view.puzzles.length}
            </span>
          </div>
        </header>
        <p className="puc-master__intro">
          Hundreds of strong-tactical puzzles in the 2500–3000 range.
          Warmup before the Legends.
        </p>
        <div className="puc-master__gallery">
          {view.puzzles.map((p, i) => {
            const solved = view.solved.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={
                  'puc-master__plaque ' +
                  (solved ? 'puc-master__plaque--solved' : '')
                }
                onClick={() => playPlaque(p)}
              >
                <div className="puc-master__plaque-num">#{i + 1}</div>
                <div className="puc-master__plaque-rating">{p.difficulty}</div>
                <div className="puc-master__plaque-plot">{p.plot}</div>
                {solved && (
                  <div
                    className="puc-master__plaque-badge"
                    aria-label="Touched"
                  >
                    🥈
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const puzzle = view.puzzle
  return (
    <div className="puc-master">
      <header className="puc-master__header">
        <button
          type="button"
          className="puc-master__back"
          onClick={backToGallery}
          aria-label="Back to gallery"
        >
          ←
        </button>
        <h1 className="puc-master__title">Master plaque · {puzzle.difficulty}</h1>
      </header>

      <div className="puc-master__play">
        <div
          className={`puc-master__board ${shake ? 'puc-master__board--shake' : ''}`}
        >
          <Board
            pieces={pieces}
            turn={game.turn()}
            orientation={puzzle.sideToMove}
            legalDestinationsFrom={legalDestinationsFrom}
            onMove={handleMove}
            lastMove={lastMove}
            checkSquare={checkSquare}
            squareSize={SQUARE_SIZE}
          />
        </div>
        <aside className="puc-master__side">
          <div className="puc-master__row">
            <span>Plot</span>
            <strong>{puzzle.plot}</strong>
          </div>
          <div className="puc-master__row">
            <span>Motif</span>
            <strong>{puzzle.motifs[0] ?? '—'}</strong>
          </div>
          <div className="puc-master__row">
            <span>To move</span>
            <strong>
              {puzzle.sideToMove === 'w' ? 'White' : 'Black'}
            </strong>
          </div>

          {view.result === null && (
            <button
              type="button"
              className="puc-master__btn puc-master__btn--skip"
              onClick={() => submit(false)}
            >
              Give up →
            </button>
          )}

          {view.result && (
            <div
              className={
                'puc-master__result ' +
                (view.result.success
                  ? 'puc-master__result--ok'
                  : 'puc-master__result--fail')
              }
            >
              <p className="puc-master__result-head">
                {view.result.success
                  ? '🥈 Touched plaque!'
                  : 'Saved — try again later'}
              </p>
              <p className="puc-master__result-delta">
                {view.result.ratingBefore} →{' '}
                <strong>{view.result.ratingAfter}</strong>
              </p>
              {view.result.pointsAdded > 0 && (
                <p className="puc-master__result-points">
                  +{view.result.pointsAdded} castle points
                </p>
              )}
              <button
                type="button"
                className="puc-master__btn puc-master__btn--primary"
                onClick={backToGallery}
              >
                Back to gallery →
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
