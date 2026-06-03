// Server-side mirror of the endgame lesson catalogue.
//
// The client list lives at apps/web/src/endgame/lessons.ts. The
// position labels here MUST stay in sync with that file because
// labels are the dedupe key for "have I already cleared this?"
// (changing a label resets that position's award eligibility — a
// known acceptable trade-off given the low total reward).

export const ENDGAME_LESSONS: Record<string, { positions: string[] }> = {
  kqk: {
    positions: ['Centre setup', 'Long diagonal queen', 'Defender squeezed'],
  },
  krk: {
    positions: ['Classic ladder', 'Rook on the corner file', 'King a step off'],
  },
  kpk: {
    positions: ['King well ahead', 'King supports from behind'],
  },
}

export const POSITION_REWARD_PTS = 5
/** Bonus when the kid clears every position in a lesson for the first time. */
export const LESSON_MASTER_BONUS_PTS = 20

export function isKnownEndgamePosition(
  lessonId: string,
  positionLabel: string,
): boolean {
  const lesson = ENDGAME_LESSONS[lessonId]
  return !!lesson && lesson.positions.includes(positionLabel)
}
