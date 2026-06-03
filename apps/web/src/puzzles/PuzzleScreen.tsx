import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import {
  ALL_PUZZLES,
  getPuzzle,
  sortByDifficulty,
} from './loader'
import { scorePuzzle } from './scoring'
import { RewardPopup } from './RewardPopup'
import { bestAttemptForPuzzle, savePuzzleAttempt, totalPuzzlePoints } from '../history/api'
import { track } from '../firebase/analytics'
import { useCastle } from '../castle/useCastle'
import { awardPoints } from '../castle/awardPoints'
import type { PuzzleAttempt } from '../history/db'
import { useSound } from '../sound/useSound'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import './PuzzleScreen.css'

const MAX_SQUARE_SIZE = 64

type Phase =
  | { kind: 'playing' }
  | { kind: 'wrong' }
  | { kind: 'solved'; attempt: PuzzleAttempt; totalBefore: number; added: number }
  | { kind: 'show-solution'; stepIndex: number }

export function PuzzleScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, setCastlePoints } = useCastle()
  const puzzle = id ? getPuzzle(id) : null

  // Fresh ChessGame seeded from the puzzle FEN. Re-created when the puzzle id changes.
  const [game, setGame] = useState(() => puzzle ? new ChessGame(puzzle.fen) : new ChessGame())
  const [moveIndex, setMoveIndex] = useState(0)
  const [wrongMoves, setWrongMoves] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'playing' })
  const [shake, setShake] = useState(false)
  const [sparkleActive, setSparkleActive] = useState(false)
  const [sparkleUsed, setSparkleUsed] = useState(false)
  const interactedRef = useRef(false)

  // Reset all state when navigating between puzzles. The dep array tracks
  // the id so a fresh nav into a new puzzle reseeds the board.
  const puzzleId = puzzle?.id
  const puzzleFen = puzzle?.fen
  useEffect(() => {
    if (!puzzleFen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(new ChessGame(puzzleFen))
    setMoveIndex(0)
    setWrongMoves(0)
    setHintsUsed(0)
    setStartedAt(null)
    setPhase({ kind: 'playing' })
    setShake(false)
    setSparkleUsed(false)
    setSparkleActive(false)
    interactedRef.current = false
  }, [puzzleId, puzzleFen])

  // ChessGame is mutated in place by game.move(), so the reference never
  // changes after the first render. We key board-derived memos off the
  // current FEN string instead — that DOES change every move, so the
  // board re-renders after each ply (including the auto-played opponent
  // reply in multi-move puzzles like mateIn2).
  const fen = puzzle ? game.fen() : ''
  const pieces = useMemo(() => fen ? piecesFromFen(fen) : {}, [fen])
  const status = game.status()
  const checkSquare = status.kind === 'in_progress' && status.inCheck ? findKing(pieces, game.turn()) : null
  const lastMove = useMemo(() => {
    const hist = game.history()
    if (hist.length === 0) return null
    const last = hist[hist.length - 1]!
    return { from: last.from, to: last.to }
    // Same fen-keyed memo: history grows whenever fen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen])

  // Solution UCI parser
  const parseUci = (uci: string): MoveInput => ({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
  })

  // What's the legal-move set for the side to move? In a puzzle we still let
  // the player explore — wrong moves trigger a shake but don't get applied.
  const legalDestinationsFrom = useCallback(
    (from: Square) => phase.kind === 'playing' ? game.legalDestinationsFrom(from) : [],
    [game, phase.kind],
  )

  const completePuzzle = useCallback(async () => {
    if (!puzzle) return
    const time = startedAt ? Date.now() - startedAt : 0
    const score = scorePuzzle({ timeMs: time, wrongMoves, hintsUsed })
    const attempt: PuzzleAttempt = {
      id: `${puzzle.id}:${Date.now()}`,
      puzzleId: puzzle.id,
      attemptedAt: Date.now(),
      solveTimeMs: time,
      wrongMoves,
      hintsUsed,
      solved: true,
      points: score.points,
      stars: score.stars,
    }
    const prevBest = await bestAttemptForPuzzle(puzzle.id)
    const totalBefore = await totalPuzzlePoints()
    await savePuzzleAttempt(attempt)
    track('puzzle_attempt', {
      puzzle_id: puzzle.id,
      solved: true,
      stars: score.stars,
      wrong_moves: wrongMoves,
      hints_used: hintsUsed,
      solve_time_ms: time,
    })
    const added = prevBest
      ? Math.max(0, attempt.points - prevBest.points)
      : attempt.points
    setPhase({ kind: 'solved', attempt, totalBefore, added })

    // Award castle points. First-time solve gets the bonus; resolves earn
    // only the marginal improvement (matches the puzzle-points model).
    const isFirstSolve = !prevBest
    const castleAward = isFirstSolve ? attempt.points : added
    if (castleAward > 0) {
      const res = await awardPoints(identity, {
        source: 'puzzle',
        puzzleId: puzzle.id,
        scorePoints: castleAward,
        isFirstSolve,
      })
      if (res) setCastlePoints(res.castlePoints)
    }
  }, [puzzle, startedAt, wrongMoves, hintsUsed, identity, setCastlePoints])

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!puzzle || phase.kind !== 'playing') return
      if (!interactedRef.current) {
        interactedRef.current = true
        setStartedAt(Date.now())
      }
      const expected = puzzle.solution[moveIndex]
      if (!expected) return
      const expectedMove = parseUci(expected)
      const isCorrect =
        move.from === expectedMove.from &&
        move.to === expectedMove.to &&
        (move.promotion ?? 'q') === (expectedMove.promotion ?? 'q')

      if (!isCorrect) {
        // Soft wrong-move feedback — don't apply, shake the board, count it.
        setWrongMoves((n) => n + 1)
        setShake(true)
        window.setTimeout(() => setShake(false), 400)
        return
      }

      // Apply the correct move.
      const applied = game.move(expectedMove)
      if (!applied) return
      if (applied.captured) sound.play('capture')
      else sound.play('move')
      const nextIdx = moveIndex + 1

      // If there's a forced reply scripted in the solution (multi-move puzzles
      // store the opponent's reply in odd indices), auto-play it.
      if (nextIdx < puzzle.solution.length) {
        const reply = parseUci(puzzle.solution[nextIdx]!)
        window.setTimeout(() => {
          const r = game.move(reply)
          if (r?.captured) sound.play('capture')
          else if (r) sound.play('move')
          setMoveIndex(nextIdx + 1)
          if (nextIdx + 1 >= puzzle.solution.length) {
            void completePuzzle()
          }
        }, 320)
        setMoveIndex(nextIdx)
        return
      }

      // No more moves expected — puzzle solved.
      setMoveIndex(nextIdx)
      void completePuzzle()
    },
    [puzzle, phase.kind, moveIndex, game, sound, completePuzzle],
  )

  const onHint = useCallback(() => {
    if (!puzzle || phase.kind !== 'playing' || hintsUsed >= 3) return
    if (!interactedRef.current) {
      interactedRef.current = true
      setStartedAt(Date.now())
    }
    setHintsUsed((n) => n + 1)
  }, [puzzle, phase.kind, hintsUsed])

  // Hint Sparkle — briefly draws the solution arrow on the board without
  // revealing the full line. Counts as 1 hint against the score, one-shot
  // per puzzle attempt.
  useEffect(() => {
    if (!sparkleActive) return
    const id = window.setTimeout(() => setSparkleActive(false), 2000)
    return () => window.clearTimeout(id)
  }, [sparkleActive])
  const onSparkle = useCallback(() => {
    if (!puzzle || phase.kind !== 'playing' || sparkleUsed) return
    if (!interactedRef.current) {
      interactedRef.current = true
      setStartedAt(Date.now())
    }
    setSparkleUsed(true)
    setHintsUsed((n) => n + 1)
    setSparkleActive(true)
  }, [puzzle, phase.kind, sparkleUsed])

  const onShowSolution = useCallback(() => {
    if (!puzzle) return
    // Reset to the original position and step through the solution with the
    // engine playing each move. This marks the puzzle as not-solved.
    setGame(new ChessGame(puzzle.fen))
    setMoveIndex(0)
    setPhase({ kind: 'show-solution', stepIndex: 0 })
  }, [puzzle])

  // Drive the show-solution animation.
  useEffect(() => {
    if (phase.kind !== 'show-solution') return
    if (!puzzle) return
    if (phase.stepIndex >= puzzle.solution.length) return
    const id = window.setTimeout(() => {
      const uci = puzzle.solution[phase.stepIndex]!
      game.move(parseUci(uci))
      setPhase({ kind: 'show-solution', stepIndex: phase.stepIndex + 1 })
    }, 700)
    return () => window.clearTimeout(id)
  }, [phase, game, puzzle])

  const goNext = useCallback(() => {
    if (!puzzle) return
    // Find the next puzzle the player hasn't solved with 3 stars, falling
    // back to "next id in difficulty order".
    const ordered = sortByDifficulty(ALL_PUZZLES)
    const idx = ordered.findIndex((p) => p.id === puzzle.id)
    const next = ordered[(idx + 1) % ordered.length]
    if (next) navigate(`/puzzles/${next.id}`)
  }, [puzzle, navigate])

  if (!puzzle) {
    return (
      <div className="puc-puzzle puc-puzzle--centered">
        <p>Puzzle not found.</p>
        <button type="button" className="puc-puzzle__btn" onClick={() => navigate('/puzzles')}>
          Back to garden
        </button>
      </div>
    )
  }

  const sideToMoveLabel = puzzle.sideToMove === 'w' ? 'White' : 'Black'

  return (
    <div className="puc-puzzle">
      <header className="puc-puzzle__header">
        <button
          type="button"
          className="puc-puzzle__back"
          onClick={() => navigate('/puzzles')}
          aria-label="Back to garden"
        >
          ←
        </button>
        <div>
          <h1 className="puc-puzzle__title">Puzzle</h1>
          <p className="puc-puzzle__sub">
            {sideToMoveLabel} to move · {puzzle.motifs[0]} · rating {puzzle.difficulty}
          </p>
        </div>
      </header>

      <div className="puc-puzzle__main">
        <div className={`puc-puzzle__board ${shake ? 'puc-puzzle__board--shake' : ''}`}>
          <Board
            pieces={pieces}
            turn={game.turn()}
            orientation={puzzle.sideToMove}
            legalDestinationsFrom={legalDestinationsFrom}
            onMove={handleMove}
            lastMove={lastMove}
            checkSquare={checkSquare}
            arrows={sparkleActive ? [{
              from: puzzle.solution[moveIndex]!.slice(0, 2) as Square,
              to: puzzle.solution[moveIndex]!.slice(2, 4) as Square,
            }] : undefined}
            squareSize={SQUARE_SIZE}
          />
        </div>

        <aside className="puc-puzzle__side">
          <div className="puc-puzzle__counters">
            <Counter label="Wrong moves" value={wrongMoves} accent={wrongMoves > 0} />
            <Counter label="Hints used" value={`${hintsUsed} / 3`} accent={hintsUsed > 0} />
          </div>

          {hintsUsed > 0 && puzzle.hints && (
            <div className="puc-puzzle__hint">
              {puzzle.hints.slice(0, hintsUsed).map((h, i) => (
                <p key={i} className="puc-puzzle__hint-line">
                  <span className="puc-puzzle__hint-tier">Hint {i + 1}:</span> {h}
                </p>
              ))}
            </div>
          )}

          <div className="puc-puzzle__actions">
            <button
              type="button"
              className="puc-puzzle__btn"
              onClick={onHint}
              disabled={phase.kind !== 'playing' || hintsUsed >= 3 || !puzzle.hints}
            >
              {hintsUsed === 0
                ? 'Show hint'
                : hintsUsed < 3
                  ? `Show hint ${hintsUsed + 1}`
                  : 'All hints used'}
            </button>
            <button
              type="button"
              className="puc-puzzle__btn puc-puzzle__btn--ghost"
              onClick={onSparkle}
              disabled={phase.kind !== 'playing' || sparkleUsed}
              title="Briefly show the next-move arrow (costs 1 hint)"
            >
              {sparkleUsed ? 'Sparkle used' : 'Show arrow'}
            </button>
            <button
              type="button"
              className="puc-puzzle__btn puc-puzzle__btn--ghost"
              onClick={onShowSolution}
              disabled={phase.kind !== 'playing'}
            >
              Show solution
            </button>
          </div>

          {phase.kind === 'show-solution' && (
            <p className="puc-puzzle__note">
              Watching the solution — this attempt won't count for points. Press <b>Next</b> when you're ready.
            </p>
          )}

          {phase.kind === 'show-solution' && (
            <button
              type="button"
              className="puc-puzzle__btn"
              onClick={goNext}
            >
              Next puzzle
            </button>
          )}
        </aside>
      </div>

      {phase.kind === 'solved' && (
        <RewardPopup
          score={{
            points: phase.attempt.points,
            stars: phase.attempt.stars as 1 | 2 | 3,
            breakdown: scorePuzzle({
              timeMs: phase.attempt.solveTimeMs,
              wrongMoves: phase.attempt.wrongMoves,
              hintsUsed: phase.attempt.hintsUsed,
            }).breakdown,
          }}
          totalBefore={phase.totalBefore}
          added={phase.added}
          onNext={goNext}
          onBack={() => navigate('/puzzles')}
        />
      )}
    </div>
  )
}

function Counter({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`puc-puzzle__counter ${accent ? 'puc-puzzle__counter--accent' : ''}`}>
      <span className="puc-puzzle__counter-label">{label}</span>
      <span className="puc-puzzle__counter-value">{value}</span>
    </div>
  )
}
