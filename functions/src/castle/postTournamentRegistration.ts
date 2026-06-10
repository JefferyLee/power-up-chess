// Helper used by registerForTournament to drop a celebratory system
// message into the Hall whenever someone joins the week's bracket.
// Fire-and-forget — chat outage should never roll back a registration.

import { getFirestore } from 'firebase-admin/firestore'
import type { ChatMessageDoc } from './chatTypes'

export async function postTournamentRegistration(args: {
  displayName: string
  /** Total registered after this entry — used for the playful "...you're
   *  #N" tail. */
  participantCount: number
  /** ISO week key — kept for traceability/idempotency hooks later. */
  weekKey: string
}): Promise<void> {
  const db = getFirestore()
  const tail =
    args.participantCount === 1
      ? "first one in — who's next?"
      : `${args.participantCount} signed up so far!`
  const text = `🏆 ${args.displayName} just signed up for this week's tournament — ${tail}`
  const msg: ChatMessageDoc = {
    name: 'Castle herald',
    uid: '',
    normalizedName: '',
    isBypass: false,
    kind: 'system',
    text,
    ts: Date.now(),
    action: { kind: 'join-tournament', weekKey: args.weekKey },
  }
  try {
    await db.collection('lobby/messages/items').add(msg)
  } catch (err) {
    console.warn('postTournamentRegistration failed:', err)
  }
}
