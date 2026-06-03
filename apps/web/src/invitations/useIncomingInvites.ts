// Subscribes the signed-in user to their pending incoming invitations.
//
// Returns the *active* invites (status === 'pending' AND expiresAt > now).
// Re-checks the expiry every second locally so a doc that the server hasn't
// expired yet still vanishes from the inbox UI at the 60 s mark.
//
// Doesn't render anything itself — the consumer (InviteInbox component)
// owns the modal.

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/app'
import type { InvitationDoc } from './types'

export function useIncomingInvites(uid: string | null): InvitationDoc[] {
  const [raw, setRaw] = useState<InvitationDoc[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!uid) {
      setRaw([])
      return
    }
    const q = query(
      collection(db, 'invitations'),
      where('toUid', '==', uid),
      where('status', '==', 'pending'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => ({ ...(d.data() as Omit<InvitationDoc, 'inviteId'>), inviteId: d.id }))
        setRaw(docs)
      },
      (err) => {
        console.warn('useIncomingInvites snapshot error:', err)
      },
    )
    return unsub
  }, [uid])

  // Local expiry sweep — re-evaluate visibility once per second. Cheap, and
  // it lets the invite modal close on its own when the 60 s counter elapses
  // without waiting for the server-side TTL.
  useEffect(() => {
    if (raw.length === 0) return
    const i = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(i)
  }, [raw.length])

  const now = Date.now()
  void tick // tick variable only forces re-render; not used in the filter
  return raw.filter((d) => d.expiresAt > now)
}
