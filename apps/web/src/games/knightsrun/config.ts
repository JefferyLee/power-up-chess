// Knight's Run — tuning knobs.
//
// The game is a VERTICAL endless bridge: a 5-file chessboard strip
// scrolling beneath the knight, who advances by real L-shaped knight
// leaps while the bridge collapses behind and enemy pieces sweep
// telegraphed attack lines across it. All numbers nominal at the
// design resolution; Phaser's FIT scale mode shrinks uniformly.

export const WORLD_WIDTH = 600
export const WORLD_HEIGHT = 800

/** Files (columns) on the bridge and square size in px. */
export const FILES = 5
export const SQ = 104
export const BOARD_X = (WORLD_WIDTH - FILES * SQ) / 2

/** The knight's square sits at this fraction of screen height. */
export const KNIGHT_ANCHOR_Y = 0.6

/** Bridge collapse — the void chases from below. */
export const COLLAPSE_START_DELAY_MS = 3500
export const COLLAPSE_SPEED_START = 26 // px/s
export const COLLAPSE_SPEED_MAX = 92
export const COLLAPSE_RAMP_PER_S = 0.6 // +px/s every second

/** Enemy sweeps (rook rank-beams / bishop diagonals). */
export const SWEEP_FIRST_MS = 6000
export const SWEEP_INTERVAL_START_MS = 6500
export const SWEEP_INTERVAL_MIN_MS = 3200
export const SWEEP_TELEGRAPH_START_MS = 1200
export const SWEEP_TELEGRAPH_MIN_MS = 800
export const SWEEP_STRIKE_MS = 260

/** Scoring. */
export const SCORE_RANK = 1
export const SCORE_PAWN = 5
export const SCORE_PIECE = 15
export const SCORE_GOLD = 20
export const SCORE_FORK = 25
