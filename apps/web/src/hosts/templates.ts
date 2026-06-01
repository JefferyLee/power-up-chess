// Template library for host one-liners.
//
// Used when no LLM call is appropriate: ordinary moves, capture spark cards,
// game-end recaps, plus as a fallback when an LLM call fails or times out
// (Phase 5).
//
// Voice rules per host live in personas.ts and docs/HOST_PERSONAS.md.
// Keep every line short (~80 chars), specific, kind, and never falsely praising.

import type { PieceSymbol } from '../chess/types'
import type { HostId } from './hosts'

export type TemplateKind =
  | 'ordinary'
  | 'capture'
  | 'check'
  | 'checkmate-win'
  | 'checkmate-loss'
  | 'stalemate'
  | 'draw'

export interface TemplateContext {
  /** Captured piece, when relevant (capture kind). */
  capturedPiece?: PieceSymbol
  /** Display name of the winning player, for checkmate-win. */
  winnerName?: string
  /** Display name of the moving / referenced player. */
  playerName?: string
}

type Template = (ctx: TemplateContext) => string

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

const s = (str: string): Template => () => str

const LUCY: Record<TemplateKind, Template[]> = {
  ordinary: [
    s('Nice and steady.'),
    s('Good focus.'),
    s('Your pieces are joining the game.'),
    s('That keeps the position calm.'),
    s('Nice — a useful move.'),
    s('Good. You are building something.'),
    s('Steady chess thinking.'),
    s('That helps your plan.'),
    s('Nice square for that piece.'),
    s('Good. Stay patient.'),
    s('A quiet, useful move.'),
    s('That gives your pieces more room.'),
  ],
  capture: [
    (ctx) => `Nice capture — that ${PIECE_NAME[ctx.capturedPiece ?? 'p']} is yours.`,
    (ctx) => `Good eye! You took the ${PIECE_NAME[ctx.capturedPiece ?? 'p']}.`,
    s('A clean capture. Stay alert for what they do next.'),
    (ctx) => `That ${PIECE_NAME[ctx.capturedPiece ?? 'p']} was loose, and you saw it.`,
    s('Nice — material in your pocket.'),
    (ctx) => `Lovely. The ${PIECE_NAME[ctx.capturedPiece ?? 'p']} is off the board.`,
    s('Good capture. Check that your piece is safe afterwards.'),
    (ctx) => `You spotted the unprotected ${PIECE_NAME[ctx.capturedPiece ?? 'p']}.`,
  ],
  check: [
    s('Check! Their king has to do something.'),
    s('A check — that forces their hand.'),
    s('Nice. Check changes their plan.'),
    s('Check. Watch what they have to give up.'),
    s('Check! Look for what opens up next.'),
  ],
  'checkmate-win': [
    (ctx) => `Checkmate. Beautifully done, ${ctx.winnerName ?? 'you'}.`,
    (ctx) => `Checkmate! ${ctx.winnerName ?? 'You'} brought the whole game together.`,
    s('Checkmate. The king has nowhere safe to go.'),
    (ctx) => `That is checkmate. Well played, ${ctx.winnerName ?? 'you'}.`,
  ],
  'checkmate-loss': [
    s('Checkmate against you this time. The position taught us something.'),
    s('It is mate. Brave game — let us see what we can learn from it.'),
    s('Mate. Onwards — we will look at the key moment together.'),
  ],
  stalemate: [
    s('Stalemate. A quiet draw, with no legal move left.'),
    s('Stalemate — a careful, even ending.'),
  ],
  draw: [
    s('A draw. The position settled with no winning path.'),
    s('Draw. Both sides held the balance.'),
    s('A drawn game. Calm and fair.'),
  ],
}

const LUCA: Record<TemplateKind, Template[]> = {
  ordinary: [
    s('Solid.'),
    s('Good plan-building move.'),
    s('Nice — getting into the action.'),
    s('That keeps your pieces working together.'),
    s('Smart, low-risk move.'),
    s('Good square for that piece.'),
    s('Steady. Keep an eye on their plan.'),
    s('Nice move. Pieces are talking to each other now.'),
    s('Good. Stay tuned for tactics.'),
    s('A confident move.'),
    s('Quiet but useful.'),
    s('Nice — sets up something later.'),
  ],
  capture: [
    (ctx) => `Got it! Their ${PIECE_NAME[ctx.capturedPiece ?? 'p']} is yours now.`,
    s('Sharp grab. Make sure your piece is safe next.'),
    (ctx) => `Boom — that ${PIECE_NAME[ctx.capturedPiece ?? 'p']} is gone.`,
    s('Nice strike. What did that open up for you?'),
    (ctx) => `You hunted that ${PIECE_NAME[ctx.capturedPiece ?? 'p']} down.`,
    s('Cool. Material is on your side now.'),
    (ctx) => `That ${PIECE_NAME[ctx.capturedPiece ?? 'p']} had no defender — well spotted.`,
    s('Clean capture. Keep scanning for the next one.'),
  ],
  check: [
    s('Check! They have to react.'),
    s('Check — let us see how they wriggle out.'),
    s('Nice, you put their king to work.'),
    s('Check. Look for what falls off after the king moves.'),
    s('Check! Forcing moves are powerful.'),
  ],
  'checkmate-win': [
    (ctx) => `Checkmate! Huge finish, ${ctx.winnerName ?? 'you'}.`,
    (ctx) => `That is mate. ${ctx.winnerName ?? 'You'} closed the trap perfectly.`,
    s('Checkmate. No squares, no defenders — game over.'),
    (ctx) => `Mate! ${ctx.winnerName ?? 'You'} earned that one.`,
  ],
  'checkmate-loss': [
    s('Checkmate this time. Brave game — onwards.'),
    s('Mate. Lots to learn from that final attack.'),
    s('It is mate. Shake it off, we will look at the key turn.'),
  ],
  stalemate: [
    s('Stalemate. No legal moves left, no check — a draw.'),
    s('Stalemate! Sometimes the king runs out of squares safely.'),
  ],
  draw: [
    s('A draw. Both sides held their ground.'),
    s('Drawn game. Honourable result.'),
    s('It is a draw. No winning path was on the board.'),
  ],
}

const TEMPLATES: Record<HostId, Record<TemplateKind, Template[]>> = {
  lucy: LUCY,
  luca: LUCA,
}

/** Small deterministic PRNG; lets tests assert variety reproducibly. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Picks template lines while avoiding recently-used lines for the same
 * (host, kind) bucket, so consecutive moves never look copy-pasted and
 * the player feels genuine variety even in a small pool.
 *
 * The avoidance window is roughly half the pool — enough to keep variety
 * high while still letting any line eventually come back.
 */
export class TemplatePicker {
  private recent = new Map<string, number[]>()
  private rng: () => number

  constructor(seed?: number) {
    this.rng = seed === undefined ? Math.random : mulberry32(seed)
  }

  pick(host: HostId, kind: TemplateKind, ctx: TemplateContext = {}): string {
    const pool = TEMPLATES[host][kind]
    if (pool.length === 0) return ''
    const key = `${host}:${kind}`
    const windowSize = Math.max(1, Math.floor(pool.length / 2))
    const recent = this.recent.get(key) ?? []

    // Build candidate set, filtering out recent picks. If everything is filtered
    // (small pool + large window), fall back to anything but the last pick.
    const candidates: number[] = []
    for (let i = 0; i < pool.length; i++) {
      if (!recent.includes(i)) candidates.push(i)
    }
    const useFrom = candidates.length > 0 ? candidates : pool.map((_, i) => i).filter((i) => i !== recent[recent.length - 1])

    const pickedAt = Math.floor(this.rng() * useFrom.length)
    const idx = useFrom[pickedAt] ?? 0

    recent.push(idx)
    while (recent.length > windowSize) recent.shift()
    this.recent.set(key, recent)

    const t = pool[idx]!
    return t(ctx)
  }
}

/** For tests / dev tools. */
export const __TEMPLATE_POOLS_FOR_TEST = TEMPLATES
