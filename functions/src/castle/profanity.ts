// Built-in profanity filter for the kids' lobby. Two tiers (Phase 1.9):
//   • ordinary profanity → starred out, message still lands;
//   • SEVERE (slurs / sexual content / self-harm bait) → whole message
//     rejected, checked against an evasion-normalised shadow too.
// Word lists are deliberately short and curated; updates are recorded in
// git history (auditability requirement in AUDIT_AND_PLAN 1.9).

const WORDS = [
  // Common English profanity
  'fuck', 'fucking', 'fucker', 'shit', 'shitty', 'bitch', 'bitches', 'asshole', 'cunt',
  'dick', 'dickhead', 'piss', 'bastard', 'crap', 'slut', 'whore', 'wanker',
  // Common slurs (intentionally not exhaustive — extend with a curated list)
  'nigger', 'faggot', 'retard', 'retarded',
  // PII patterns that should never land in public chat
  // (handled separately by PII regex below)
]

// High-risk terms that REJECT the whole message rather than star it out
// (Phase 1.9). Slurs and sexual content have no place in a kids' hall even
// as asterisks; detection runs on a normalised shadow of the text so simple
// leetspeak / spacing evasion doesn't slip through.
const SEVERE_WORDS = [
  'nigger', 'nigga', 'faggot', 'kike', 'chink', 'spic', 'tranny',
  'rape', 'rapist', 'porn', 'pornhub', 'blowjob', 'handjob', 'cum',
  'pussy', 'vagina', 'penis', 'dildo', 'hentai', 'incest', 'pedo', 'pedophile',
  'kys', 'killyourself',
]
const SEVERE_RE = new RegExp(`\\b(${SEVERE_WORDS.join('|')})\\b`, 'i')

/** Fold common evasion: leetspeak digits/symbols → letters, drop separators
 *  between letters (d.i.c.k / f-u-c-k), collapse repeated letters (fuuuck). */
export function normalizeForDetection(input: string): string {
  const leet: Record<string, string> = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
    '@': 'a', '$': 's', '!': 'i', '+': 't',
  }
  return input
    .toLowerCase()
    .replace(/[0134578@$!+]/g, (c) => leet[c] ?? c)
    // Drop separator runs BETWEEN letters so "f.u-c_k" reads as one word,
    // without gluing genuinely separate words together (single spaces stay).
    .replace(/([a-z])[.\-_*·]+(?=[a-z])/g, '$1')
    // Collapse 3+ repeats of one letter to a single letter (fuuuck → fuck).
    .replace(/([a-z])\1{2,}/g, '$1')
}

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
  /** True when the message must NOT land at all (severe term hit) —
   *  callers reject instead of posting the starred version. */
  reject: boolean
}

/** Replace profanity with asterisks and zap PII. Returns the cleaned text
 *  and whether any change was made. */
export function scrubMessage(input: string): ScrubResult {
  const reasons: string[] = []
  let text = input

  // Severe tier first — checked on both the raw text and the
  // evasion-normalised shadow; a hit rejects the whole message.
  if (SEVERE_RE.test(input) || SEVERE_RE.test(normalizeForDetection(input))) {
    return { text: '', censored: true, reasons: ['severe'], reject: true }
  }

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

  return { text, censored: reasons.length > 0, reasons, reject: false }
}
