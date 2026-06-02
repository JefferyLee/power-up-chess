// Realtime subscription for in-duel chat. One hook per room.

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../firebase/app'

interface WizardChatMessageBase {
  id: string
  uid: string
  displayName: string
  /** Player color, or null for spectators. */
  color: 'w' | 'b' | null
  /** 'player' for the two seated wizards, 'spectator' for watchers. */
  role?: 'player' | 'spectator'
  ts: number
  cost: number
}

interface WizardChatTextMessage extends WizardChatMessageBase {
  kind: 'text'
  text: string
}

interface WizardChatVoiceMessage extends WizardChatMessageBase {
  kind: 'voice'
  audioBase64: string
  mimeType: string
  durationMs: number
}

export type WizardChatMessage = WizardChatTextMessage | WizardChatVoiceMessage

const MAX_VISIBLE = 60

export function useWizardChatMessages(roomId: string): WizardChatMessage[] {
  const [messages, setMessages] = useState<WizardChatMessage[]>([])
  useEffect(() => {
    if (!roomId) return
    const q = query(
      collection(db, `wizard_rooms/${roomId}/messages`),
      orderBy('ts', 'desc'),
      limit(MAX_VISIBLE),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WizardChatMessage))
          .reverse()
        setMessages(rows)
      },
      (err) => {
        console.warn('useWizardChatMessages:', err)
      },
    )
    return unsub
  }, [roomId])
  return messages
}
