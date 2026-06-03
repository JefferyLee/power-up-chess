// Subscribes to ONE outgoing invitation by id. Used by the sender's
// "waiting for response" toast — the moment the server flips status to
// 'accepted', the toast reads roomId and navigates both clients to the
// freshly-spawned room.

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import type { InvitationDoc } from './types'

export function useOutgoingInvite(inviteId: string | null): InvitationDoc | null {
  const [invite, setInvite] = useState<InvitationDoc | null>(null)

  useEffect(() => {
    if (!inviteId) {
      setInvite(null)
      return
    }
    const ref = doc(db, 'invitations', inviteId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setInvite(null)
          return
        }
        const data = snap.data() as Omit<InvitationDoc, 'inviteId'>
        setInvite({ ...data, inviteId: snap.id })
      },
      (err) => {
        console.warn('useOutgoingInvite snapshot error:', err)
      },
    )
    return unsub
  }, [inviteId])

  return invite
}
