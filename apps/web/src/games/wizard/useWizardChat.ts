// Realtime subscription for in-duel chat. One hook per room.

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../firebase/app'

export interface WizardChatMessage {
  id: string
  uid: string
  displayName: string
  color: 'w' | 'b'
  kind: 'text'
  text: string
  ts: number
  cost: number
}

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
          .map((d) => ({ id: d.id, ...(d.data() as Omit<WizardChatMessage, 'id'>) }))
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
