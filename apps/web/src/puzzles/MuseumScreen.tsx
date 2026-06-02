// MuseumScreen — shared component behind LegendsHallScreen and
// MasterAtriumScreen. Both surface the same shape: a gated server-list
// of plaque puzzles + an inline play view with per-puzzle result. The
// per-screen wrappers in this folder supply the callable, copy, and
// variant accent.

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
  callSubmitPuzzleAttempt,
  type ServerPuzzle,
} from '../firebase/callables'
import './MuseumScreen.css'

const MAX_SQUARE_SIZE = 56

export interface MuseumListResponse {
  ok: true
  puzzles: ServerPuzzle[]
  solved: string[]
  totalSolved: number
  unlockThreshold: number
}

export interface MuseumCopy {
  /** Shown while the list call is in flight. */
  loading: string
  /** Shown when the visitor has no real identity (bypass / no magic word). */
  accessError: string
  /** Shown when the list callable throws. */
  loadError: string
  lockedTitle: string
  /** Trails "{remaining} more puzzles " — e.g. "to earn the key.". */
  lockedBlurbReason: string
  /** Header title on the gallery + back link in playing view's header. */
  galleryTitle: string
  /** Top-right counter label, e.g. "Badges". */
  metaLabel: string
  /** One-line intro under the gallery header. */
  intro: string
  /** Prefix for playing-view title — final text is "{prefix} · {difficulty}". */
  playingTitlePrefix: string
  solvedBadgeEmoji: string
  solvedBadgeAria: string
  /** Banner shown after a successful solve. */
  resultHeadSuccess: string
}

export interface MuseumConfig {
  variant: 'legends' | 'master'
  loadList: (req: { normalizedName: string }) => Promise<MuseumListResponse>
  copy: MuseumCopy
}

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

export function MuseumScreen({ config }: { config: MuseumConfig }) {
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, setCastlePoints } = useCastle()
  const authState = useAuthUid()
  const authReady = authState.status === 'ready'
  const normalizedName = identity?.normalizedName ?? ''
  const rootClass = `puc-museum puc-museum--${config.variant}`
  const { copy, loadList } = config

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
      setView({ kind: 'error', message: copy.accessError })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await loadList({ normalizedName })
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
        console.error('museum list call failed:', err)
        if (cancelled) return
        setView({ kind: 'error', message: copy.loadError })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, identity, normalizedName, loadList, copy.accessError, copy.loadError])

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

  const playPlaque = useCallback((puzzle: ServerPuzzle) => {
    setGame(new ChessGame(puzzle.fen))
    setMoveIndex(0)
    startedAtRef.current = null
    setView({ kind: 'playing', puzzle, result: null })
  }, [])

  const backToGallery = useCallback(() => {
    setView({ kind: 'gallery', puzzles: allPuzzles, solved: solvedSet })
  }, [allPuzzles, solvedSet])

  // ── render ───────────────────────────────────────────────────────────

  if (view.kind === 'loading') {
    return (
      <div className={`${rootClass} puc-museum--centered`}>
        <p>{copy.loading}</p>
      </div>
    )
  }
  if (view.kind === 'error') {
    return (
      <div className={`${rootClass} puc-museum--centered`}>
        <p className="puc-museum__error">{view.message}</p>
        <button
          type="button"
          className="puc-museum__btn"
          onClick={() => navigate('/puzzles')}
        >
          Back to garden
        </button>
      </div>
    )
  }
  if (view.kind === 'locked') {
    return (
      <div className={`${rootClass} puc-museum--centered`}>
        <div className="puc-museum__locked-icon">🔒</div>
        <h1 className="puc-museum__locked-title">{copy.lockedTitle}</h1>
        <p className="puc-museum__locked-blurb">
          Solve {view.threshold - view.solved} more puzzles {copy.lockedBlurbReason}
          {' '}You&apos;ve solved <strong>{view.solved}</strong> so far.
        </p>
        <button
          type="button"
          className="puc-museum__btn puc-museum__btn--primary"
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
      <div className={rootClass}>
        <header className="puc-museum__header">
          <button
            type="button"
            className="puc-museum__back"
            onClick={() => navigate('/puzzles')}
            aria-label="Back to garden"
          >
            ←
          </button>
          <h1 className="puc-museum__title">{copy.galleryTitle}</h1>
          <div className="puc-museum__meta">
            <span className="puc-museum__meta-label">{copy.metaLabel}</span>
            <span className="puc-museum__meta-value">
              {earned} / {view.puzzles.length}
            </span>
          </div>
        </header>
        <p className="puc-museum__intro">{copy.intro}</p>
        <div className="puc-museum__gallery">
          {view.puzzles.map((p, i) => {
            const solved = view.solved.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={
                  'puc-museum__plaque ' +
                  (solved ? 'puc-museum__plaque--solved' : '')
                }
                onClick={() => playPlaque(p)}
              >
                <div className="puc-museum__plaque-num">#{i + 1}</div>
                <div className="puc-museum__plaque-rating">{p.difficulty}</div>
                <div className="puc-museum__plaque-plot">{p.plot}</div>
                {solved && (
                  <div
                    className="puc-museum__plaque-badge"
                    aria-label={copy.solvedBadgeAria}
                  >
                    {copy.solvedBadgeEmoji}
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
    <div className={rootClass}>
      <header className="puc-museum__header">
        <button
          type="button"
          className="puc-museum__back"
          onClick={backToGallery}
          aria-label="Back to gallery"
        >
          ←
        </button>
        <h1 className="puc-museum__title">
          {copy.playingTitlePrefix} · {puzzle.difficulty}
        </h1>
      </header>

      <div className="puc-museum__play">
        <div
          className={`puc-museum__board ${shake ? 'puc-museum__board--shake' : ''}`}
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
        <aside className="puc-museum__side">
          <div className="puc-museum__row">
            <span>Plot</span>
            <strong>{puzzle.plot}</strong>
          </div>
          <div className="puc-museum__row">
            <span>Motif</span>
            <strong>{puzzle.motifs[0] ?? '—'}</strong>
          </div>
          <div className="puc-museum__row">
            <span>To move</span>
            <strong>{puzzle.sideToMove === 'w' ? 'White' : 'Black'}</strong>
          </div>

          {view.result === null && (
            <button
              type="button"
              className="puc-museum__btn puc-museum__btn--skip"
              onClick={() => submit(false)}
            >
              Give up →
            </button>
          )}

          {view.result && (
            <div
              className={
                'puc-museum__result ' +
                (view.result.success
                  ? 'puc-museum__result--ok'
                  : 'puc-museum__result--fail')
              }
            >
              <p className="puc-museum__result-head">
                {view.result.success
                  ? copy.resultHeadSuccess
                  : 'Saved — try again later'}
              </p>
              <p className="puc-museum__result-delta">
                {view.result.ratingBefore} →{' '}
                <strong>{view.result.ratingAfter}</strong>
              </p>
              {view.result.pointsAdded > 0 && (
                <p className="puc-museum__result-points">
                  +{view.result.pointsAdded} castle points
                </p>
              )}
              <button
                type="button"
                className="puc-museum__btn puc-museum__btn--primary"
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
