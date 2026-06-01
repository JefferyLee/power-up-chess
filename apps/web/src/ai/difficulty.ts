// Difficulty tiers for Kind AI Practice.
//
// We combine UCI skill level (0-20) with a low search depth + short movetime
// to approximate weaker play. Stockfish below skill 5 is still very strong
// at depth 8+, so we use shallow depths to get a fair opponent for Ada.
//
// Rough Elo bands (anecdotal):
//   Beginner: skill 0, depth 4, ~300 ms       — target for ~500 rating
//   Easy:     skill 5, depth 7, ~500 ms       — ~1000 rating
//   Medium:   skill 10, depth 10, ~800 ms     — ~1500 rating

export type DifficultyId = 'beginner' | 'easy' | 'medium'

export interface AiSettings {
  /** UCI Skill Level option (0-20). */
  skillLevel: number
  /** Search depth ceiling. */
  depth: number
  /** Search time ceiling in ms. */
  movetimeMs: number
}

export interface DifficultyPreset {
  id: DifficultyId
  label: string
  short: string
  blurb: string
  settings: AiSettings
}

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    short: '★',
    blurb: 'Friendly opponent, makes plenty of beginner mistakes.',
    settings: { skillLevel: 0, depth: 4, movetimeMs: 300 },
  },
  {
    id: 'easy',
    label: 'Easy',
    short: '★★',
    blurb: 'Plays solidly. You will need to watch for tactics.',
    settings: { skillLevel: 5, depth: 7, movetimeMs: 500 },
  },
  {
    id: 'medium',
    label: 'Medium',
    short: '★★★',
    blurb: 'Sharp — bring your best calculation.',
    settings: { skillLevel: 10, depth: 10, movetimeMs: 800 },
  },
]

export const DEFAULT_DIFFICULTY_ID: DifficultyId = 'beginner'

export function difficultyById(id: string): DifficultyPreset {
  return DIFFICULTY_PRESETS.find((d) => d.id === id) ?? DIFFICULTY_PRESETS[0]!
}
