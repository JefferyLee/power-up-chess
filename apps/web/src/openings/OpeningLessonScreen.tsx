// OpeningLessonScreen — flashcard-style "find the principled move"
// walkthrough of a single opening (P2.J Slice 1).
//
// Flow: load position N → player makes a move → if matches the
// expected UCI, animate it, reveal the explanation, advance to N+1.
// Wrong → shake the board, drop a hint after the first miss, and on
// the second miss show the expected move with a "Got it" advance.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useSound } from '../sound/useSound'
import { getOpening, type OpeningPosition } from './openings'
import './OpeningLessonScreen.css'

const MAX_SQUARE_SIZE = 72

type Phase =
  | { kind: 'asking'; wrong: number }
  | { kind: 'revealed' }
  | { kind: 'done' }

export function OpeningLessonScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const opening = useMemo(() => getOpening(id), [id])

  const [posIndex, setPosIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'asking', wrong: 0 })
  const [game, setGame] = useState<ChessGame>(() =>
    opening ? new ChessGame(opening.positions[0]!.fen) : new ChessGame(),
  )
  const [shake, setShake] = useState(false)
  // Tick bumped after every applied move so derived state recomputes
  // (ChessGame mutates in place).
  const [tick, setTick] = useState(0)

  const current: OpeningPosition | null =
    opening && posIndex < opening.positions.length
      ? opening.positions[posIndex]!
      : null

  // Reset board state whenever we move to a new position.
  useEffect(() => {
    if (!current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(new ChessGame(current.fen))
    setTick((t) => t + 1)
    setPhase({ kind: 'asking', wrong: 0 })
  }, [current])

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

  const legalDestinationsFrom = useCallback(
    (from: Square) =>
      phase.kind === 'asking' ? game.legalDestinationsFrom(from) : [],
    [phase, game],
  )

  const handleMove = useCallback(
    (input: MoveInput) => {
      if (!current || phase.kind !== 'asking') return
      const uci =
        input.from + input.to + (input.promotion ? input.promotion : '')
      if (uci === current.expectedUci) {
        // Correct — apply the move so the board animates to its new
        // state, play sound, reveal the explanation.
        const result = game.move(input)
        if (result?.captured) sound.play('capture')
        else sound.play('move')
        setTick((t) => t + 1)
        setPhase({ kind: 'revealed' })
        return
      }
      // Wrong — shake, increment, do NOT apply (board snaps back).
      sound.play('check') // existing sound; works as a soft "nope"
      setShake(true)
      window.setTimeout(() => setShake(false), 400)
      setPhase((p) =>
        p.kind === 'asking' ? { kind: 'asking', wrong: p.wrong + 1 } : p,
      )
    },
    [current, phase, game, sound],
  )

  const advance = useCallback(() => {
    if (!opening) return
    const next = posIndex + 1
    if (next >= opening.positions.length) {
      setPhase({ kind: 'done' })
      return
    }
    setPosIndex(next)
  }, [opening, posIndex])

  const revealAndAdvance = useCallback(() => {
    if (!current) return
    // Play the expected move so the board shows what was correct,
    // then move on.
    const input: MoveInput = {
      from: current.expectedUci.slice(0, 2) as Square,
      to: current.expectedUci.slice(2, 4) as Square,
      promotion:
        current.expectedUci.length === 5
          ? (current.expectedUci[4] as 'q' | 'r' | 'b' | 'n')
          : undefined,
    }
    const result = game.move(input)
    if (result?.captured) sound.play('capture')
    else sound.play('move')
    setTick((t) => t + 1)
    setPhase({ kind: 'revealed' })
  }, [current, game, sound])

  const restart = useCallback(() => {
    setPosIndex(0)
  }, [])

  if (!opening) {
    return (
      <div className="puc-opl puc-opl--centered">
        <p>Unknown opening.</p>
        <button
          type="button"
          className="puc-opl__btn"
          onClick={() => navigate('/openings')}
        >
          Back to list
        </button>
      </div>
    )
  }

  const total = opening.positions.length
  const wrongCount = phase.kind === 'asking' ? phase.wrong : 0

  return (
    <div className="puc-opl">
      <header className="puc-opl__header">
        <button
          type="button"
          className="puc-opl__back"
          onClick={() => navigate('/openings')}
          aria-label="Back to openings list"
        >
          ←
        </button>
        <div className="puc-opl__title-wrap">
          <h1 className="puc-opl__title">{opening.name}</h1>
          <p className="puc-opl__sub">{opening.flavour}</p>
        </div>
        <div className="puc-opl__counter" aria-label="Position progress">
          <span className="puc-opl__counter-label">Position</span>
          <span className="puc-opl__counter-num">
            {Math.min(posIndex + 1, total)}
          </span>
          <span className="puc-opl__counter-of">/ {total}</span>
        </div>
      </header>

      <main className="puc-opl__main">
        <div
          className={
            'puc-opl__board ' + (shake ? 'puc-opl__board--shake' : '')
          }
        >
          <Board
            pieces={pieces}
            turn={game.turn()}
            orientation="w"
            legalDestinationsFrom={legalDestinationsFrom}
            onMove={handleMove}
            lastMove={lastMove}
            checkSquare={checkSquare}
            squareSize={SQUARE_SIZE}
          />
        </div>

        <aside className="puc-opl__side">
          {current && phase.kind === 'asking' && (
            <>
              <p className="puc-opl__context">{current.context}</p>
              <p className="puc-opl__prompt">
                Find the <strong>principled move</strong> for White.
              </p>
              {wrongCount >= 1 && (
                <div className="puc-opl__hint">
                  <span className="puc-opl__hint-tag">Hint</span> {current.hint}
                </div>
              )}
              {wrongCount >= 2 && (
                <div className="puc-opl__hint puc-opl__hint--strong">
                  <span className="puc-opl__hint-tag">Answer</span>{' '}
                  {current.expectedSan} — press the button to see it played.
                </div>
              )}
              {wrongCount >= 2 && (
                <button
                  type="button"
                  className="puc-opl__btn"
                  onClick={revealAndAdvance}
                >
                  Show me {current.expectedSan} →
                </button>
              )}
            </>
          )}

          {current && phase.kind === 'revealed' && (
            <>
              <p className="puc-opl__correct">
                ✓ {current.expectedSan} —{' '}
                {wrongCount === 0
                  ? 'first try!'
                  : wrongCount === 1
                    ? 'after one miss.'
                    : 'with a peek at the answer.'}
              </p>
              <p className="puc-opl__explanation">{current.explanation}</p>
              <button
                type="button"
                className="puc-opl__btn puc-opl__btn--primary"
                onClick={advance}
              >
                {posIndex + 1 >= total
                  ? 'Finish lesson →'
                  : 'Next position →'}
              </button>
            </>
          )}

          {phase.kind === 'done' && (
            <>
              <h2 className="puc-opl__done-title">Opening mastered ✓</h2>
              <p className="puc-opl__done-body">
                You walked the main line of the {opening.shortName}. Play it
                in a real game and the first six moves are now muscle
                memory.
              </p>
              <div className="puc-opl__done-actions">
                <button
                  type="button"
                  className="puc-opl__btn"
                  onClick={() => navigate('/openings')}
                >
                  Back to list
                </button>
                <button
                  type="button"
                  className="puc-opl__btn puc-opl__btn--primary"
                  onClick={restart}
                >
                  Run it again
                </button>
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
