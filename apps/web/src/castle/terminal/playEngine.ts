// Lazy singleton Stockfish for the terminal's /play command. We
// don't want to boot the engine on every Hall mount — only when the
// kid actually starts a game.
//
// Difficulty is exposed as an Elo-style rating (kid types `/play 1500`).
// We map rating to a (depth, skillLevel) pair. Skill Level is a
// Stockfish UCI option (0-20) that adds noise + caps search width;
// shallow depth makes the engine miss long tactics. Combined they
// give a smooth ramp without us having to write our own evaluator.

import { StockfishEngine } from '../../engine/stockfish'

let enginePromise: Promise<StockfishEngine> | null = null

function getEngine(): Promise<StockfishEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const engine = new StockfishEngine()
      await engine.ready()
      return engine
    })()
  }
  return enginePromise
}

/** Rating → (depth, skillLevel). Rough calibration — Stockfish at
 *  skill 0 / depth 1 still beats true beginners cleanly, so the floor
 *  is "achievable for a 300-rated kid", not literal Elo. */
export function difficultyFor(rating: number): { depth: number; skillLevel: number } {
  const r = Math.max(300, Math.min(2800, Math.round(rating)))
  // Piecewise — kids' band gets fine resolution, masters band is flat.
  if (r <= 600)  return { depth: 1, skillLevel: 0 }
  if (r <= 900)  return { depth: 2, skillLevel: 1 }
  if (r <= 1100) return { depth: 3, skillLevel: 3 }
  if (r <= 1300) return { depth: 4, skillLevel: 5 }
  if (r <= 1500) return { depth: 5, skillLevel: 8 }
  if (r <= 1700) return { depth: 6, skillLevel: 10 }
  if (r <= 1900) return { depth: 7, skillLevel: 12 }
  if (r <= 2100) return { depth: 9, skillLevel: 15 }
  if (r <= 2300) return { depth: 12, skillLevel: 18 }
  return { depth: 15, skillLevel: 20 }
}

export async function bestReplyUci(fen: string, rating: number): Promise<string> {
  const engine = await getEngine()
  const { depth, skillLevel } = difficultyFor(rating)
  const res = await engine.analyze(fen, depth, skillLevel)
  return res.bestMoveUci
}

/** Coach-grade eval (white-POV centipawns, mate baked in as a very
 *  large magnitude per the stockfish wrapper). Always full-strength
 *  (skill 20) at modest depth — used to label kid moves as Best /
 *  Mistake / Blunder rather than to pick moves. */
const COACH_DEPTH = 10
export async function coachEval(fen: string): Promise<number> {
  const engine = await getEngine()
  const res = await engine.analyze(fen, COACH_DEPTH, 20)
  return res.evalCp
}
