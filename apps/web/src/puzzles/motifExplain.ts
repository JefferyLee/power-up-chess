// Offline, gate-safe fallback explanations keyed by tactic motif. Used when a
// puzzle has no authored explanation and the LLM call is unavailable (timeout,
// error, or template-only mode). Original, child-friendly, motif-correct.

const MOTIF_LINES: Record<string, string> = {
  fork: "That's a fork — one piece attacks two at once, and they can't both run away!",
  knightFork: 'A knight fork! The knight jumps in and pokes two pieces at the same time.',
  pawnFork: 'A tiny pawn forking two big pieces — cheeky and strong!',
  royalFork: 'A royal fork — hitting the king and another piece together, so you win material.',
  pin: "A pin! That piece is stuck — if it moves, something bigger behind it falls.",
  absolutePin: "An absolute pin — the piece truly can't move, because its own king is right behind it.",
  skewer: 'A skewer — the big piece has to step aside and lets you grab the one behind it.',
  backRankMate: 'Back-rank mate! The king was trapped behind its own pawns.',
  mateIn1: 'Checkmate — the king had nowhere left to go!',
  mateIn2: 'A two-move mate: you set the trap and the king could not escape.',
  hangingPiece: 'You spotted a piece just hanging there for free — sharp eyes!',
  discoveredAttack: 'A discovered attack — moving one piece unleashed the one hiding behind it!',
}

/** Best matching motif line, else a warm generic. */
export function motifExplanation(motifs: string[]): string {
  for (const m of motifs) {
    const line = MOTIF_LINES[m]
    if (line) return line
  }
  return 'Great solve — you found the winning idea!'
}
