// 6-char base36 team id. Same scheme as rooms — short enough to fit
// in a URL/share link, large enough that 36^6 ≈ 2.2B keeps collisions
// unrealistic at our scale.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateTeamId(): string {
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

/** Cheap normaliser — clients pass the displayed team name; we
 *  lowercase + collapse whitespace for uniqueness checks. */
export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
