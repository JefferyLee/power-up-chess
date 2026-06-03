// Knight's Run — tuning knobs.
//
// All numbers in screen pixels and ms. The scene scales itself to its
// container, so these are nominal values at the design resolution
// (WORLD_WIDTH × WORLD_HEIGHT). On smaller screens Phaser's FIT scale mode
// shrinks everything uniformly; gameplay feels the same.

export const WORLD_WIDTH = 900
export const WORLD_HEIGHT = 360

/** Ground line — Knight's feet rest here at idle. */
export const GROUND_Y = 290

/** Horizontal speed of the world scrolling past, in px/sec. Grows over time
 *  via SPEED_RAMP_PER_SEC up to MAX_SPEED. */
export const START_SPEED = 280
export const MAX_SPEED = 620
export const SPEED_RAMP_PER_SEC = 6 // every second, +6 px/sec

/** Jump physics — single-tap parabolic arc, no double jump in M0. */
export const JUMP_VELOCITY = -680 // negative = up
export const GRAVITY_Y = 1800

/** Spawn cadence for obstacles. We pick a random delay from
 *  [SPAWN_MIN_MS, SPAWN_MAX_MS] but the upper bound shrinks as speed grows
 *  so the game stays interesting at high speed. */
export const SPAWN_MIN_MS = 700
export const SPAWN_MAX_MS = 1600

/** Score = distance, in px/100 → "metres". Display only; not gameplay. */
export const SCORE_PER_PX = 0.01

/** Coin pickup — bright yellow disc. One coin = +25 points. */
export const COIN_VALUE = 25
/** Spawn cadence is independent of obstacles so they don't synchronise into
 *  unfair patterns. Same speed-scaled tightening as obstacles. */
export const COIN_SPAWN_MIN_MS = 900
export const COIN_SPAWN_MAX_MS = 2200
/** Coins float at "easy jump height" most of the time + sometimes at
 *  ground level so casual running picks them up. */
export const COIN_FLOAT_HEIGHTS = [-60, -90, -120, 0] // negative = above ground
