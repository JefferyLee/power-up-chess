// Tuning constants for the Wizard Duel V2 Phaser scene.

export const TILE = 72                                       // px per square
export const BOARD_SIZE = TILE * 8                           // 576
export const BOARD_MARGIN = 18                               // rank/file labels gutter
export const WORLD_WIDTH = BOARD_SIZE + BOARD_MARGIN * 2     // 612
export const WORLD_HEIGHT = BOARD_SIZE + BOARD_MARGIN * 2

/** Board colours — purple to match the castle theme. Light = parchment, dark =
 *  twilight purple. Adjusted so the stone pieces (white marble + obsidian)
 *  both read clearly on either square type. */
export const SQ_LIGHT = 0x3a2e5e
export const SQ_DARK  = 0x1e1638
/** Last-move highlight tint, blended on top of the square colour. */
export const LAST_MOVE_TINT = 0xf4c266
export const LAST_MOVE_ALPHA = 0.22

/** Animation timings — all in ms. */
export const MOVE_TWEEN_MS = 280
export const CAPTURE_LUNGE_OVERSHOOT = 4   // px past the dest, snaps back briefly
export const CAPTURE_FADE_MS = 240
export const DUST_PARTICLE_COUNT = 8
