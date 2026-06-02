// LegendsHallScreen — museum-style gallery of the 100 Legends puzzles.
//
// Each puzzle is a plaque card showing the rating + a gold badge if the
// kid has already solved it. Click plays the puzzle inline (single-puzzle
// view, no plot rotation). The kid's plot ratings still update normally;
// success here also pushes the id into puzzleLegendsBadges.

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
  callGetLegendsList,
  callSubmitPuzzleAttempt,
  type ServerPuzzle,
} from '../firebase/callables'
import './LegendsHallScreen.css'

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

export function LegendsHallScreen() {
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
        message: 'Legends Hall is for signed-in guests with a magic word.',
      })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await callGetLegendsList({ normalizedName })
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
        console.error('getLegendsList failed:', err)
        if (cancelled) return
        setView({ kind: 'error', message: 'Could not load Legends Hall.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, identity, normalizedName])

  // ── play loop (only valid when view.kind === 'playing') ─────────────

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

  const playPlaque = useCallback(
    (puzzle: ServerPuzzle) => {
      setGame(new ChessGame(puzzle.fen))
      setMoveIndex(0)
      startedAtRef.current = null
      setView({ kind: 'playing', puzzle, result: null })
    },
    [],
  )

  const backToGallery = useCallback(() => {
    setView({ kind: 'gallery', puzzles: allPuzzles, solved: solvedSet })
  }, [allPuzzles, solvedSet])

  // ── render ───────────────────────────────────────────────────────────

  if (view.kind === 'loading') {
    return (
      <div className="puc-legends puc-legends--centered">
        <p>Opening the Legends Hall…</p>
      </div>
    )
  }
  if (view.kind === 'error') {
    return (
      <div className="puc-legends puc-legends--centered">
        <p className="puc-legends__error">{view.message}</p>
        <button
          type="button"
          className="puc-legends__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (view.kind === 'locked') {
    return (
      <div className="puc-legends puc-legends--centered">
        <div className="puc-legends__locked-icon">🔒</div>
        <h1 className="puc-legends__locked-title">Legends Hall is locked</h1>
        <p className="puc-legends__locked-blurb">
          Solve {view.threshold - view.solved} more puzzles to earn the key.
          {' '}You&apos;ve solved <strong>{view.solved}</strong> so far.
        </p>
        <button
          type="button"
          className="puc-legends__btn puc-legends__btn--primary"
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
      <div className="puc-legends">
        <header className="puc-legends__header">
          <button
            type="button"
            className="puc-legends__back"
            onClick={() => navigate('/puzzles')}
            aria-label="Back to garden"
          >
            ←
          </button>
          <h1 className="puc-legends__title">Legends Hall</h1>
          <div className="puc-legends__meta">
            <span className="puc-legends__meta-label">Badges</span>
            <span className="puc-legends__meta-value">
              {earned} / {view.puzzles.length}
            </span>
          </div>
        </header>
        <p className="puc-legends__intro">
          One hundred master-tier puzzles. Solve any for a permanent gold badge.
        </p>
        <div className="puc-legends__gallery">
          {view.puzzles.map((p, i) => {
            const solved = view.solved.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={
                  'puc-legends__plaque ' +
                  (solved ? 'puc-legends__plaque--solved' : '')
                }
                onClick={() => playPlaque(p)}
              >
                <div className="puc-legends__plaque-num">#{i + 1}</div>
                <div className="puc-legends__plaque-rating">{p.difficulty}</div>
                <div className="puc-legends__plaque-plot">{p.plot}</div>
                {solved && (
                  <div
                    className="puc-legends__plaque-badge"
                    aria-label="Solved"
                  >
                    🏅
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // view.kind === 'playing'
  const puzzle = view.puzzle
  return (
    <div className="puc-legends">
      <header className="puc-legends__header">
        <button
          type="button"
          className="puc-legends__back"
          onClick={backToGallery}
          aria-label="Back to gallery"
        >
          ←
        </button>
        <h1 className="puc-legends__title">Legends plaque · {puzzle.difficulty}</h1>
      </header>

      <div className="puc-legends__play">
        <div
          className={`puc-legends__board ${shake ? 'puc-legends__board--shake' : ''}`}
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
        <aside className="puc-legends__side">
          <div className="puc-legends__row">
            <span>Plot</span>
            <strong>{puzzle.plot}</strong>
          </div>
          <div className="puc-legends__row">
            <span>Motif</span>
            <strong>{puzzle.motifs[0] ?? '—'}</strong>
          </div>
          <div className="puc-legends__row">
            <span>To move</span>
            <strong>
              {puzzle.sideToMove === 'w' ? 'White' : 'Black'}
            </strong>
          </div>

          {view.result === null && (
            <button
              type="button"
              className="puc-legends__btn puc-legends__btn--skip"
              onClick={() => submit(false)}
            >
              Give up →
            </button>
          )}

          {view.result && (
            <div
              className={
                'puc-legends__result ' +
                (view.result.success
                  ? 'puc-legends__result--ok'
                  : 'puc-legends__result--fail')
              }
            >
              <p className="puc-legends__result-head">
                {view.result.success ? '🏅 Badge earned!' : 'Saved — try again later'}
              </p>
              <p className="puc-legends__result-delta">
                {view.result.ratingBefore} →{' '}
                <strong>{view.result.ratingAfter}</strong>
              </p>
              {view.result.pointsAdded > 0 && (
                <p className="puc-legends__result-points">
                  +{view.result.pointsAdded} castle points
                </p>
              )}
              <button
                type="button"
                className="puc-legends__btn puc-legends__btn--primary"
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
