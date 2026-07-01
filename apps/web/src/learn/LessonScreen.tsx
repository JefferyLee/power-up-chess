// LessonScreen — runs one tutorial lesson step by step.
//
// Layout:
//   ┌─ header: ← back · title · "Step X / Y" · Skip
//   ├─ body: Board (if step.fen set) with optional arrow / try-move
//   └─ footer: host portrait + speech bubble + Next button

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { piecesFromFen } from '../chess/fen'
import type { MoveInput, Square } from '../chess/types'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { useSound } from '../sound/useSound'
import { HostPortrait } from '../castle/HostPortrait'
import { lessonById, LESSONS } from './lessons'
import type { LessonStep, TryMoveStep } from './lessonTypes'
import { useCastle } from '../castle/useCastle'
import { callAwardTutorialComplete } from '../firebase/callables'
import { track } from '../firebase/analytics'
import { markLessonDone } from './progress'
import './LessonScreen.css'

const MAX_SQUARE_SIZE = 56

interface RunnerState {
  stepIndex: number
  /** For try-move steps: true once the player has made the expected
   *  move and we're showing the success body before advancing. */
  succeeded: boolean
}

export function LessonScreen() {
  const navigate = useNavigate()
  const { lessonId } = useParams<{ lessonId: string }>()
  const lesson = lessonId ? lessonById(lessonId) : null
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const sound = useSound()
  const { identity, setCastlePoints } = useCastle()
  const isLastLesson =
    lesson !== null && LESSONS[LESSONS.length - 1]?.id === lesson.id

  const [state, setState] = useState<RunnerState>({ stepIndex: 0, succeeded: false })
  const [reward, setReward] = useState<{ added: number } | null>(null)
  const step = lesson ? lesson.steps[state.stepIndex] : undefined

  // Fresh ChessGame per step so the player's try-move doesn't carry
  // into the next step's setup.
  const game = useMemo(() => {
    if (!step?.fen) return null
    return new ChessGame(step.fen)
  }, [step])
  const [, forceRerender] = useState(0)
  const pieces = useMemo(() => (game ? piecesFromFen(game.fen()) : {}), [game])
  const turn = game?.turn() ?? 'w'

  // Reset succeeded when the step changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, succeeded: false }))
  }, [state.stepIndex])

  // ── try-move: restrict legal moves to ONLY the expected from→to ─────
  const legalDestinationsFrom = useCallback(
    (from: Square) => {
      if (!step || step.kind !== 'try-move' || state.succeeded) return []
      if (from !== step.from) return []
      return [step.to]
    },
    [step, state.succeeded],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      if (!step || step.kind !== 'try-move' || !game) return
      if (move.from !== step.from || move.to !== step.to) return
      // Apply for the visual feedback of the piece landing.
      game.move({ from: step.from, to: step.to, promotion: step.promotion })
      forceRerender((n) => n + 1)
      sound.play('move')
      setState((s) => ({ ...s, succeeded: true }))
    },
    [step, game, sound],
  )

  // ── handlers ────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (!lesson) return
    const next = state.stepIndex + 1
    if (next >= lesson.steps.length) {
      // Lesson complete — mark client-side so /learn shows a checkmark.
      markLessonDone(lesson.id)
      // Observability: finishing the last lesson = tutorial series done.
      if (isLastLesson) track('tutorial_completed', { lesson_id: lesson.id })
      // If this is the LAST lesson and the kid is signed in (not a
      // bypass), claim the one-time tutorial-complete reward. Server
      // enforces once-ever; we only update local state on a real award.
      if (isLastLesson && identity && !identity.isBypass) {
        void callAwardTutorialComplete({ normalizedName: identity.normalizedName })
          .then((res) => {
            if (res.added > 0) {
              setCastlePoints(res.castlePoints)
              setReward({ added: res.added })
              // Hold the reward toast briefly before going back.
              window.setTimeout(() => navigate('/learn'), 2200)
              return
            }
            navigate('/learn')
          })
          .catch((err) => {
            console.warn('awardTutorialComplete failed:', err)
            navigate('/learn')
          })
        return
      }
      navigate('/learn')
      return
    }
    setState({ stepIndex: next, succeeded: false })
  }, [lesson, state.stepIndex, navigate, isLastLesson, identity, setCastlePoints])

  const goBack = useCallback(() => {
    navigate('/learn')
  }, [navigate])

  // ── render ──────────────────────────────────────────────────────────
  if (!lesson) {
    return (
      <div className="puc-lesson puc-lesson--centered">
        <p>Lesson not found.</p>
        <button type="button" className="puc-lesson__btn" onClick={() => navigate('/learn')}>
          Back to lessons
        </button>
      </div>
    )
  }

  if (!step) {
    return (
      <div className="puc-lesson puc-lesson--centered">
        <p>Loading lesson…</p>
      </div>
    )
  }

  const hostName = lesson.hostId === 'lucy' ? 'Lucy' : 'Luca'
  const body = bodyFor(step, state.succeeded)
  const showBoard = !!step.fen
  const showNext = step.kind !== 'try-move' || state.succeeded
  const isOutro = step.kind === 'outro'
  const nextLabel =
    state.stepIndex + 1 >= lesson.steps.length ? 'Finish lesson →' : 'Next →'

  const arrows =
    step.kind === 'arrow'
      ? [{ from: step.from, to: step.to }]
      : step.kind === 'try-move' && !state.succeeded && step.showHintArrow !== false
        ? [{ from: step.from, to: step.to }]
        : undefined

  return (
    <div className="puc-lesson">
      <header className="puc-lesson__header">
        <button
          type="button"
          className="puc-lesson__back"
          onClick={goBack}
          aria-label="Back to lessons"
        >
          ←
        </button>
        <div className="puc-lesson__title-wrap">
          <h1 className="puc-lesson__title">{lesson.title}</h1>
          <p className="puc-lesson__progress">
            Step {state.stepIndex + 1} / {lesson.steps.length}
          </p>
        </div>
        <button type="button" className="puc-lesson__skip" onClick={goBack}>
          Skip
        </button>
      </header>

      <div
        className={
          'puc-lesson__progressbar ' +
          (isOutro ? 'puc-lesson__progressbar--full' : '')
        }
      >
        <span
          className="puc-lesson__progressbar-fill"
          style={{
            width: `${((state.stepIndex + (state.succeeded || isOutro ? 1 : 0)) / lesson.steps.length) * 100}%`,
          }}
        />
      </div>

      <main className="puc-lesson__main">
        {showBoard && game && (
          <div className="puc-lesson__board">
            <Board
              pieces={pieces}
              turn={turn}
              orientation={step.orientation ?? 'w'}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              arrows={arrows}
              squareSize={SQUARE_SIZE}
            />
          </div>
        )}

        <aside className="puc-lesson__side">
          <div className="puc-lesson__host">
            <div className="puc-lesson__portrait">
              <HostPortrait
                hostId={lesson.hostId}
                variant="lobby"
                mood={
                  // Outro celebrates; a solved try-move also cheers;
                  // an unsolved try-move shows the host "thinking"
                  // alongside the kid. Default happy for narration steps.
                  isOutro || state.succeeded
                    ? 'cheering'
                    : step.kind === 'try-move'
                      ? 'thinking'
                      : 'happy'
                }
              />
            </div>
            <span className="puc-lesson__hostname">{hostName}</span>
          </div>
          <div
            className={
              'puc-lesson__bubble ' +
              (isOutro ? 'puc-lesson__bubble--celebrate' : '')
            }
          >
            {isOutro && step.kind === 'outro' && (
              <h2 className="puc-lesson__bubble-title">{step.title}</h2>
            )}
            <p className="puc-lesson__bubble-text">{body}</p>
          </div>

          {showNext && (
            <button
              type="button"
              className={
                'puc-lesson__btn puc-lesson__btn--primary' +
                (state.succeeded ? ' puc-lesson__btn--pulse' : '')
              }
              onClick={advance}
            >
              {nextLabel}
            </button>
          )}

          {reward && reward.added > 0 && (
            <div className="puc-lesson__reward" role="status">
              🎉 Tutorial complete! +{reward.added} castle points
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

function bodyFor(step: LessonStep, succeeded: boolean): string {
  if (step.kind === 'try-move' && succeeded) {
    return (step as TryMoveStep).successBody
  }
  return step.kind === 'outro' ? step.body : step.body
}
