// SentInviteToast — small persistent corner notice that follows the
// sender across the castle while their invite is in flight.
//
// State pulled from useOutgoingInvite(inviteId). When the recipient
// accepts and the room is spawned, this toast navigates the sender
// straight in. On decline / ignore / expire / cancel, the toast shows
// the terminal state for a few seconds then dismisses itself.
//
// Only one at a time — context tracks a single inviteId.

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { callCancelInvite } from '../firebase/callables'
import { useOutgoingInvite } from './useOutgoingInvite'
import { useOutgoingInviteContext } from './OutgoingInviteContext'
import './SentInviteToast.css'

export function SentInviteToast() {
  const { inviteId, setInviteId } = useOutgoingInviteContext()
  const invite = useOutgoingInvite(inviteId)
  const navigate = useNavigate()
  const [now, setNow] = useState(Date.now())
  const [autoDismissAt, setAutoDismissAt] = useState<number | null>(null)

  useEffect(() => {
    if (!inviteId) return
    const i = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(i)
  }, [inviteId])

  // React to status transitions: navigate on accept, schedule dismiss on
  // terminal-but-not-accept.
  useEffect(() => {
    if (!invite) return
    if (invite.status === 'accepted' && invite.roomId) {
      navigate(`/r/${invite.roomId}`)
      setInviteId(null)
      return
    }
    if (
      invite.status === 'declined'
      || invite.status === 'ignored'
      || invite.status === 'expired'
      || invite.status === 'cancelled'
    ) {
      if (autoDismissAt === null) setAutoDismissAt(Date.now() + 4000)
    }
  }, [invite, navigate, setInviteId, autoDismissAt])

  useEffect(() => {
    if (autoDismissAt === null) return
    const ms = autoDismissAt - Date.now()
    const t = window.setTimeout(() => {
      setInviteId(null)
      setAutoDismissAt(null)
    }, Math.max(0, ms))
    return () => window.clearTimeout(t)
  }, [autoDismissAt, setInviteId])

  if (!inviteId || !invite) return null

  const onCancel = async () => {
    try { await callCancelInvite({ inviteId }) } catch { /* best-effort */ }
    setInviteId(null)
  }

  const secondsLeft = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))

  let body: ReactNode
  switch (invite.status) {
    case 'pending':
      body = (
        <>
          <p className="puc-sit__title">Waiting on {invite.toName}…</p>
          <p className="puc-sit__sub">{secondsLeft}s left</p>
          <button type="button" className="puc-sit__cancel" onClick={onCancel}>
            Cancel
          </button>
        </>
      )
      break
    case 'declined':
      body = <p className="puc-sit__title">{invite.toName} declined.</p>
      break
    case 'ignored':
      body = <p className="puc-sit__title">{invite.toName} didn't reply.</p>
      break
    case 'expired':
      body = <p className="puc-sit__title">Invite expired.</p>
      break
    case 'cancelled':
      body = <p className="puc-sit__title">Invite cancelled.</p>
      break
    case 'accepted':
      // Transition state — navigation will fire from the effect above.
      body = <p className="puc-sit__title">{invite.toName} accepted — entering the room…</p>
      break
  }

  return createPortal(
    <div
      className={
        'puc-sit'
        + (invite.status === 'pending' ? '' : ' puc-sit--terminal')
        + (invite.status === 'accepted' ? ' puc-sit--accept' : '')
      }
      role="status"
      aria-live="polite"
    >
      {body}
    </div>,
    document.body,
  )
}
