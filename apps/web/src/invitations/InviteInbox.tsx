// InviteInbox — the global "you got an invite!" modal.
//
// Mounted once at the App root next to GlobalPresenceHeartbeat. Subscribes
// the signed-in user to pending invitations addressed to them. When one
// arrives, this puts up a modal with Accept / Decline / Ignore + a 60 s
// countdown bar. Accept navigates to the spawned room; decline / ignore /
// expire just dismiss.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthUid } from '../auth/useAuthUid'
import { useCosmetics } from '../cosmetics/useCosmetics'
import { callRespondInvite } from '../firebase/callables'
import { useIncomingInvites } from './useIncomingInvites'
import type { InvitationDoc } from './types'
import './InviteInbox.css'

export function InviteInbox() {
  const auth = useAuthUid()
  const uid = auth.status === 'ready' ? auth.uid : null
  const invites = useIncomingInvites(uid)
  const loc = useLocation()

  // Don't pop modals while the user is mid-game. They can still react via
  // the chess/wizard UI's own systems; surfacing a modal would interrupt.
  const inGameRoute = loc.pathname.startsWith('/r/') || loc.pathname.startsWith('/wizard/')
  if (inGameRoute) return null

  // Just take the most recent — multiple at once is unlikely + would cascade.
  const invite = invites[0] ?? null
  if (!invite) return null

  return <IncomingInviteModal invite={invite} />
}

function IncomingInviteModal({ invite }: { invite: InvitationDoc }) {
  const navigate = useNavigate()
  const cosmetics = useCosmetics()
  const [phase, setPhase] = useState<'idle' | 'accepting' | 'declining' | 'ignoring' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(i)
  }, [])

  const secondsLeft = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000))
  const pct = Math.max(0, Math.min(100, Math.round(((invite.expiresAt - now) / 60000) * 100)))

  const respond = async (response: 'accept' | 'decline' | 'ignore') => {
    const nextPhase = response === 'accept' ? 'accepting' : response === 'decline' ? 'declining' : 'ignoring'
    setPhase(nextPhase)
    setError(null)
    try {
      const res = await callRespondInvite({
        inviteId: invite.inviteId,
        response,
        ...(response === 'accept' ? { pieceSetId: cosmetics.pieceSetId } : {}),
      })
      if (response === 'accept' && res.roomId) {
        navigate(`/r/${res.roomId}`)
      }
      // Listener will drop the invite from the inbox now that status != pending,
      // unmounting this modal.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const tcLabel = invite.timeControl
    ? `${Math.round(invite.timeControl.initialMs / 60000)} min${invite.timeControl.incrementMs > 0 ? ` + ${invite.timeControl.incrementMs / 1000}s` : ''}`
    : 'No clock'

  return createPortal(
    <div className="puc-inbox-overlay" role="dialog" aria-label="Chess invitation">
      <div className="puc-inbox__card">
        <p className="puc-inbox__eyebrow">Chess invitation</p>
        <h2 className="puc-inbox__title">{invite.fromName} wants to play.</h2>
        <p className="puc-inbox__sub">
          Time control: <b>{tcLabel}</b>
        </p>
        <div className="puc-inbox__countdown">
          <div className="puc-inbox__countdown-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="puc-inbox__timer">{secondsLeft}s to decide</p>

        {error && <p className="puc-inbox__error">{error}</p>}

        <div className="puc-inbox__actions">
          <button
            type="button"
            className="puc-inbox__btn puc-inbox__btn--accept"
            onClick={() => respond('accept')}
            disabled={phase !== 'idle' && phase !== 'error'}
          >
            {phase === 'accepting' ? 'Joining…' : 'Accept'}
          </button>
          <button
            type="button"
            className="puc-inbox__btn"
            onClick={() => respond('decline')}
            disabled={phase !== 'idle' && phase !== 'error'}
          >
            {phase === 'declining' ? '…' : 'Decline'}
          </button>
          <button
            type="button"
            className="puc-inbox__btn puc-inbox__btn--ignore"
            onClick={() => respond('ignore')}
            disabled={phase !== 'idle' && phase !== 'error'}
            title="Mark seen but stay quiet — no reply sent."
          >
            {phase === 'ignoring' ? '…' : 'Ignore'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
