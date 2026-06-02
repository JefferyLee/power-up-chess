// Helper used by createRoom + createWizardRoom to drop a system message
// into the Hall whenever a new private room is minted. The message gets
// a Join button on the client.

import { getFirestore } from 'firebase-admin/firestore'
import type { ChatMessageDoc } from './chatTypes'

export async function postRoomInvite(args: {
  roomKind: 'chess' | 'wizard'
  roomId: string
  openerName: string
}): Promise<void> {
  const db = getFirestore()
  const text = args.roomKind === 'wizard'
    ? `✨ ${args.openerName} just opened a Wizard's Duel — anyone brave enough to step in?`
    : `🏰 ${args.openerName} just opened a chess room — want to play?`
  const msg: ChatMessageDoc = {
    name: 'Castle herald',
    uid: '',
    normalizedName: '',
    isBypass: false,
    kind: 'system',
    text,
    ts: Date.now(),
    action: {
      kind: 'join-room',
      roomKind: args.roomKind,
      roomId: args.roomId,
      openerName: args.openerName,
    },
  }
  try {
    await db.collection('lobby/messages/items').add(msg)
  } catch (err) {
    // Don't fail the room creation if the invite post errors — it's a
    // nice-to-have, not a hard requirement.
    console.warn('postRoomInvite failed:', err)
  }
}
