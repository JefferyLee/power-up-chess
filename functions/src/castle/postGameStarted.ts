// postGameStarted — drops a Hall message the moment a chess or wizard
// game goes live (both players in, status flipped to 'live'). Carries
// a `spectate-room` action so onlookers can tap in as a read-only
// viewer (existing spectator path at /r/<id> or /wizard/<id>).

import { getFirestore } from 'firebase-admin/firestore'
import type { ChatMessageDoc } from './chatTypes'

export async function postGameStarted(args: {
  roomKind: 'chess' | 'wizard'
  roomId: string
  whiteName: string
  blackName: string
}): Promise<void> {
  const db = getFirestore()
  const text = args.roomKind === 'wizard'
    ? `✨ ${args.whiteName} vs ${args.blackName} just started a Wizard's Duel — watch them play!`
    : `🏰 ${args.whiteName} vs ${args.blackName} just started a chess game — watch them play!`
  const msg: ChatMessageDoc = {
    name: 'Castle herald',
    uid: '',
    normalizedName: '',
    isBypass: false,
    kind: 'system',
    text,
    ts: Date.now(),
    action: {
      kind: 'spectate-room',
      roomKind: args.roomKind,
      roomId: args.roomId,
      whiteName: args.whiteName,
      blackName: args.blackName,
    },
  }
  try {
    await db.collection('lobby/messages/items').add(msg)
  } catch (err) {
    console.warn('postGameStarted failed:', err)
  }
}
