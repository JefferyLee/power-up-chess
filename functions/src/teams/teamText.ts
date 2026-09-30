// Team names and mottos are kid-authored free text that lands on a
// public team page and in Hall broadcasts, so they go through the same
// profanity + PII scrub as chat. Unlike chat there is no "star it out"
// middle tier: a starred team name is still a bad team name, so anything
// the scrub would touch is rejected outright.

import { HttpsError } from 'firebase-functions/v2/https'
import { scrubMessage } from '../castle/profanity'

export function assertCleanTeamText(label: 'name' | 'motto', text: string): void {
  if (!text) return
  const scrub = scrubMessage(text)
  if (scrub.reject || scrub.censored) {
    throw new HttpsError(
      'invalid-argument',
      `That team ${label} can’t be used in the castle — try a different one.`,
    )
  }
}
