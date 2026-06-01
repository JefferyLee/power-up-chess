// Tiny built-in profanity filter. Conservative; aimed at obvious nastiness
// in a kids' lobby, not at total coverage. We rewrite, not reject — the
// censored star-stuff still lets the rest of the message land.
//
// The list is deliberately short. Adding hate slurs, exhaustive coverage,
// and locale handling is a Phase D++ concern; this is the floor.

const WORDS = [
  // Common English profanity
  'fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'bitches', 'asshole', 'cunt',
  'dick', 'dickhead', 'piss', 'bastard', 'crap', 'slut', 'whore', 'wanker',
  // Common slurs (intentionally not exhaustive — extend with a curated list)
  'nigger', 'faggot', 'retard', 'retarded',
  // PII patterns that should never land in public chat
  // (handled separately by PII regex below)
]

const WORD_RE = new RegExp(`\\b(${WORDS.join('|')})\\b`, 'gi')
const PII_PATTERNS: Array<{ name: string; re: RegExp }> = [
  // Phone numbers (loose: 7+ digits with optional separators)
  { name: 'phone', re: /(?:\+?\d[\s\-.]?){7,}\d/g },
  // Emails
  { name: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi },
]

export interface ScrubResult {
  text: string
  /** True if anything was censored — caller may choose to drop, warn, etc. */
  censored: boolean
  reasons: string[]
}

/** Replace profanity with asterisks and zap PII. Returns the cleaned text
 *  and whether any change was made. */
export function scrubMessage(input: string): ScrubResult {
  const reasons: string[] = []
  let text = input

  let hadProfanity = false
  text = text.replace(WORD_RE, (m) => {
    hadProfanity = true
    return '*'.repeat(m.length)
  })
  if (hadProfanity) reasons.push('profanity')

  for (const { name, re } of PII_PATTERNS) {
    if (re.test(text)) {
      reasons.push(name)
    }
    // Reset before replace because test() advances lastIndex on global regex.
    re.lastIndex = 0
    text = text.replace(re, (m) => '*'.repeat(Math.min(m.length, 12)))
  }

  return { text, censored: reasons.length > 0, reasons }
}
