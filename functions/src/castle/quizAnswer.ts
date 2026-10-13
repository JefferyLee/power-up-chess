// Story-quiz answer matching. Pure, so it can be tested without Firestore
// or Gemini (storyQuiz.ts pulls both in).
//
// The model lists only 2-4 accepted variants, and a kid who heard "the
// sixteenth century" may type "sixteenth", "16th" or "16th century"
// (playtest 2026-10-13: all three were marked wrong). So a guess matches
// when, after lowercasing, stripping punctuation, turning number words
// and ordinals into digits and dropping a leading article, it equals an
// accepted answer or is its leading words (or the answer is the guess's
// leading words). The shorter side must be at least two characters.

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
/** Ordinals that are not just the cardinal plus "th". */
const ODD_ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fifth: 5, eighth: 8, ninth: 9, twelfth: 12,
}

function wordToNumber(word: string): number | null {
  const digits = /^(\d+)(?:st|nd|rd|th)?$/.exec(word)
  if (digits) return Number(digits[1])
  if (word in UNITS) return UNITS[word]!
  if (word in TENS) return TENS[word]!
  if (word in ODD_ORDINALS) return ODD_ORDINALS[word]!
  if (word.endsWith('ieth') && word.slice(0, -4) + 'y' in TENS) return TENS[word.slice(0, -4) + 'y']!
  if (word.endsWith('th') && word.slice(0, -2) in UNITS) return UNITS[word.slice(0, -2)]!
  return null
}

/** Tokens with numbers canonicalised ("twenty-first" → "21", "16th" → "16")
 *  and a leading "the" / "a" / "an" dropped. */
export function canonicalTokens(input: string): string[] {
  const words = normalizeAnswer(input).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    const n = wordToNumber(words[i]!)
    if (n === null) { out.push(words[i]!); continue }
    const next = i + 1 < words.length ? wordToNumber(words[i + 1]!) : null
    if (n >= 20 && n % 10 === 0 && next !== null && next >= 1 && next <= 9 && !/^\d/.test(words[i + 1]!)) {
      out.push(String(n + next))
      i++
    } else {
      out.push(String(n))
    }
  }
  if (out.length > 1 && (out[0] === 'the' || out[0] === 'a' || out[0] === 'an')) out.shift()
  return out
}

export function answerMatches(guess: string, accepted: readonly string[]): boolean {
  const g = canonicalTokens(guess)
  if (g.length === 0) return false
  return accepted.some((answer) => {
    const a = canonicalTokens(answer)
    if (a.length === 0) return false
    const [short, long] = g.length <= a.length ? [g, a] : [a, g]
    if (short.join(' ').length < 2) return false
    return short.every((w, i) => w === long[i])
  })
}
