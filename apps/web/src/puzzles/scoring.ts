// Puzzle scoring.
//
// Solving alone is worth +10. Bonuses for speed, no mistakes, no hints
// stack on top to a max of +15, so the per-puzzle range is 10–25 — always
// positive (solving is always celebrated).
//
// Stars are a separate, kid-friendly summary:
//   3 stars — clean and quick: no wrong moves, no hints, under 30 seconds.
//   2 stars — solid: ≤1 wrong move, ≤1 hint, under 60 seconds.
//   1 star  — solved (any path).

export interface PuzzleResultInput {
  /** Wall-clock time from first interaction to correct final move, in ms. */
  timeMs: number
  /** Number of moves the player tried before the correct one. */
  wrongMoves: number
  /** Hints consumed from the 3-rung ladder. */
  hintsUsed: number
}

export interface PuzzleScore {
  points: number
  stars: 1 | 2 | 3
  breakdown: {
    base: number
    speed: number
    firstTry: number
    noHints: number
  }
}

const BASE = 10
const SPEED_FAST_MS = 15_000
const SPEED_MID_MS = 30_000
const SPEED_SLOW_MS = 60_000

export function scorePuzzle(input: PuzzleResultInput): PuzzleScore {
  const base = BASE

  const speed =
    input.timeMs <= SPEED_FAST_MS ? 5
      : input.timeMs <= SPEED_MID_MS ? 3
        : input.timeMs <= SPEED_SLOW_MS ? 1
          : 0

  const firstTry =
    input.wrongMoves === 0 ? 5
      : input.wrongMoves === 1 ? 2
        : 0

  const noHints =
    input.hintsUsed === 0 ? 5
      : input.hintsUsed === 1 ? 2
        : 0

  const points = base + speed + firstTry + noHints

  let stars: 1 | 2 | 3 = 1
  if (input.wrongMoves === 0 && input.hintsUsed === 0 && input.timeMs <= SPEED_MID_MS) {
    stars = 3
  } else if (
    input.wrongMoves <= 1 &&
    input.hintsUsed <= 1 &&
    input.timeMs <= SPEED_SLOW_MS
  ) {
    stars = 2
  }

  return {
    points,
    stars,
    breakdown: { base, speed, firstTry, noHints },
  }
}

/** Human-friendly summary for the reward popup. */
export function starLabel(stars: 1 | 2 | 3): string {
  switch (stars) {
    case 3: return 'Beautiful! Spotted in a flash.'
    case 2: return 'Nicely solved!'
    case 1: return 'You got there — try again to find it faster.'
  }
}
