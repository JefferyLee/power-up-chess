// Lesson script schema for the Chess Basics Tutorial.
//
// Each lesson is a static array of LessonSteps. The runner walks
// through them sequentially:
//   - 'intro' / 'outro' / 'arrow': read + click Next
//   - 'try-move': player must drag the expected piece to the expected
//     destination; runner advances on success
//
// FENs always include both kings (chess.js requires it). Lessons with
// "single piece" demos put the kings in corners out of the way.

import type { Square as SquareName } from '../chess/types'

export type HostId = 'lucy' | 'luca'

interface BaseStep {
  /** Position to set up for this step. Omitted ⇒ board hidden (pure
   *  text step). */
  fen?: string
  /** White at bottom by default. */
  orientation?: 'w' | 'b'
}

export interface IntroStep extends BaseStep {
  kind: 'intro'
  body: string
}

export interface ArrowStep extends BaseStep {
  kind: 'arrow'
  body: string
  /** Single move arrow drawn over the board (no interaction). */
  from: SquareName
  to: SquareName
}

export interface TryMoveStep extends BaseStep {
  kind: 'try-move'
  body: string
  from: SquareName
  to: SquareName
  /** Optional promotion piece for pawn promotion try-moves. */
  promotion?: 'q' | 'r' | 'b' | 'n'
  /** Shown briefly when the player succeeds, before advancing. */
  successBody: string
  /** If true, the runner shows a guide-arrow on the board to help
   *  brand-new players. Default true. */
  showHintArrow?: boolean
}

export interface OutroStep extends BaseStep {
  kind: 'outro'
  title: string
  body: string
}

export type LessonStep = IntroStep | ArrowStep | TryMoveStep | OutroStep

export interface Lesson {
  id: string
  /** Short title shown in the list + at the top of the runner. */
  title: string
  /** One-line blurb on the list card. */
  blurb: string
  /** Rough length so kids can budget time. */
  estimatedMinutes: number
  /** Which host narrates this lesson. */
  hostId: HostId
  steps: LessonStep[]
}
