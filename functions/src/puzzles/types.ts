// Puzzle Garden Cloud Function request/response types + Firestore shapes.
//
// Mirrors the importer's output schema in tools/puzzle-import/src/types.ts
// — keep them in lockstep.

export type Plot =
  | 'mate'
  | 'fork'
  | 'pinSkewer'
  | 'sacrifice'
  | 'endgame'
  | 'defense'

export const PLOTS: Plot[] = [
  'mate',
  'fork',
  'pinSkewer',
  'sacrifice',
  'endgame',
  'defense',
]

/** Firestore shape for puzzles/{id}. Written by the import pipeline. */
export interface PuzzleDoc {
  id: string
  fen: string
  sideToMove: 'w' | 'b'
  solution: string[]
  motifs: string[]
  plot: Plot
  difficulty: number          // Lichess Glicko rating
  ratingDeviation: number
  legends: boolean
  source: {
    provider: 'lichess'
    puzzleId: string
    license: 'CC0'
  }
  explanation?: string
  hints?: [string, string, string]
}

// ─── per-plot ratings on guests/{normalizedName} ─────────────────────────

export type PuzzleRatings = Partial<Record<Plot, number>>

/** Default starting rating when a kid has never solved anything in this plot. */
export const DEFAULT_RATING = 400

/** ELO K-factor — tuned high so kids' ratings converge quickly. */
export const ELO_K = 32

/** Floor / ceiling on per-plot ratings. Matches the puzzle pool range. */
export const RATING_MIN = 100
export const RATING_MAX = 3200

/** ± window around the player's rating when serving a puzzle. */
export const SERVE_WINDOW = 100

/** How many of the most-recently-served puzzle ids we remember per
 *  guest, so we don't repeat them within a short stretch. */
export const SEEN_CAP = 200

/** Castle-point awards per solve. */
// Three-tier puzzle rewards (Ada's spec): normal / master / legend.
// Difficulty-based, NOT player-relative — solving a tough puzzle pays
// the same whether you barely cleared it or breezed through.
export const PUZZLE_POINTS = {
  normal: 5,             // any regular plot puzzle (rating < 2500)
  master: 25,            // Master's Atrium (2500-2999)
  legends: 50,           // Legends Hall (3000+, legends === true)
}
/** Rating floor that separates a master-tier puzzle from a normal one. */
export const MASTER_RATING_FLOOR = 2500

// ─── nextPuzzle ──────────────────────────────────────────────────────────

export interface GetNextPuzzleRequest {
  normalizedName: string
  plot: Plot
  /** Optional override: serve at this rating instead of the kid's plot
   *  rating. Lets the in-plot "easier/harder" dial work. */
  ratingOverride?: number
}

export type GetNextPuzzleResponse =
  | {
      ok: true
      puzzle: PuzzleDoc
      /** Kid's current rating in this plot (post-default). */
      playerRating: number
    }
  | { ok: false; reason: 'empty' | 'invalid-input' | 'not-found' }

// ─── submitPuzzleAttempt ─────────────────────────────────────────────────

export interface SubmitPuzzleAttemptRequest {
  normalizedName: string
  puzzleId: string
  success: boolean
  /** Optional client-measured time-to-solve in ms. Recorded but not
   *  used for scoring. */
  timeMs?: number
}

export interface SubmitPuzzleAttemptResponse {
  ok: true
  /** Plot of the puzzle that was attempted. */
  plot: Plot
  /** Player's prior rating in this plot (pre-update). */
  ratingBefore: number
  /** Player's new rating in this plot (post-update). */
  ratingAfter: number
  /** Puzzle's own rating, returned so the client can show the delta. */
  puzzleRating: number
  /** Castle points awarded for this attempt (0 on failure, or if the
   *  guest is a bypass). Includes the +10 daily-completion bonus when
   *  this attempt closes out Today's Five. */
  castlePointsAdded: number
  /** Guest's castle-point balance after this award. */
  castlePoints: number
  legends: boolean
  /** True if this attempt was the 5th of Today's Five and the
   *  completion bonus fired. */
  dailyCompletedNow?: boolean
  /** Amount of the daily-completion bonus (0 unless dailyCompletedNow). */
  dailyBonusAdded?: number
}

// ─── getCalibrationSet ───────────────────────────────────────────────────

/** Puzzle ratings we pull for the 5-puzzle onboarding ladder. */
export const CALIBRATION_RUNGS: number[] = [300, 500, 700, 1000, 1300]

export interface GetCalibrationSetRequest {
  normalizedName: string
}

export type GetCalibrationSetResponse =
  | { ok: true; puzzles: PuzzleDoc[]; alreadyCalibrated: boolean }
  | { ok: false; reason: 'invalid-input' | 'empty' }

// ─── submitCalibration ───────────────────────────────────────────────────

/** After the 5-puzzle ladder, the client posts one of these to seed every
 *  per-plot rating in one shot. The server picks an initial rating from
 *  the success pattern instead of grinding 5 ELO updates one by one. */
export interface SubmitCalibrationRequest {
  normalizedName: string
  /** One entry per CALIBRATION_RUNGS rung — `true` = solved. */
  results: boolean[]
}

export interface SubmitCalibrationResponse {
  ok: true
  /** The single seed rating applied to every plot. */
  seedRating: number
}
