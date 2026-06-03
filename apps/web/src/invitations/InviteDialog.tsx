// InviteDialog — the time-control picker the sender sees after pressing
// "Invite to play" on a User Card. Mirrors TimeControlDialog's UX so kids
// who've opened a normal chess room recognise the shape.
//
// On Send: calls callSendInvite which charges 5 CP server-side, creates
// the pending Firestore doc, and returns the inviteId + expiresAt. We
// surface a "Waiting for {name}..." toast inside the dialog while the
// outgoing-invite subscription watches for the recipient's response.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
  type TimeControlPreset,
} from '../clock/timeControl'
import { callCancelInvite, callSendInvite } from '../firebase/callables'
import { useOutgoingInvite } from './useOutgoingInvite'
import { INVITE_COST_CP } from './types'
import './InviteDialog.css'

interface Props {
  toNormalizedName: string
  toDisplayName: string
  selfNormalizedName: string
  onClose: () => void
  /** Called after the recipient accepts and the room is spawned. */
  onSent: () => void
}

type Phase =
  | { kind: 'compose' }
  | { kind: 'sending' }
  | { kind: 'waiting'; inviteId: string; expiresAt: number }
  | { kind: 'error'; message: string }

export function InviteDialog({
  toNormalizedName,
  toDisplayName,
  selfNormalizedName,
  onClose,
  onSent,
}: Props) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TIME_CONTROL_ID)
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' })
  const selected =
    TIME_CONTROL_PRESETS.find((p) => p.id === selectedId) ?? TIME_CONTROL_PRESETS[0]!

  // While in 'waiting' phase, react to the outgoing invite's status flips.
  // accepted → navigate both clients into the new room.
  const waitingId = phase.kind === 'waiting' ? phase.inviteId : null
  const outgoing = useOutgoingInvite(waitingId)
  if (waitingId && outgoing && outgoing.status === 'accepted' && outgoing.roomId) {
    // Navigate immediately, then signal closure.
    navigate(`/r/${outgoing.roomId}`)
    // Defer onSent so the navigate has time to commit before the parent
    // tears us down (React batches both into the next tick anyway).
    queueMicrotask(onSent)
  }

  const onSend = async (preset: TimeControlPreset) => {
    setPhase({ kind: 'sending' })
    try {
      const res = await callSendInvite({
        fromNormalizedName: selfNormalizedName,
        toNormalizedName,
        timeControl: preset.value,
      })
      setPhase({ kind: 'waiting', inviteId: res.inviteId, expiresAt: res.expiresAt })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const onCancel = async () => {
    if (phase.kind === 'waiting') {
      try { await callCancelInvite({ inviteId: phase.inviteId }) } catch { /* best-effort */ }
    }
    onClose()
  }

  return createPortal(
    <div
      className="puc-invite"
      role="dialog"
      aria-label="Send chess invitation"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="puc-invite__card">
        {(phase.kind === 'compose' || phase.kind === 'sending' || phase.kind === 'error') && (
          <>
            <h2 className="puc-invite__title">
              Invite {toDisplayName} to play
            </h2>
            <p className="puc-invite__sub">
              Pick a time control. Sending costs <b>{INVITE_COST_CP} ✦</b> whether
              they accept, decline, or let it expire.
            </p>
            <div className="puc-invite__grid">
              {TIME_CONTROL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    'puc-invite__option'
                    + (preset.id === selectedId ? ' puc-invite__option--on' : '')
                  }
                  disabled={phase.kind !== 'compose'}
                  onClick={() => setSelectedId(preset.id)}
                >
                  <span className="puc-invite__option-short">{preset.short}</span>
                  <span className="puc-invite__option-label">{preset.label}</span>
                </button>
              ))}
            </div>
            {phase.kind === 'error' && (
              <p className="puc-invite__error">{phase.message}</p>
            )}
            <div className="puc-invite__actions">
              <button
                type="button"
                className="puc-invite__btn"
                onClick={onCancel}
                disabled={phase.kind === 'sending'}
              >Cancel</button>
              <button
                type="button"
                className="puc-invite__btn puc-invite__btn--primary"
                onClick={() => onSend(selected)}
                disabled={phase.kind === 'sending'}
              >
                {phase.kind === 'sending'
                  ? 'Sending…'
                  : `Send (${INVITE_COST_CP} ✦)`}
              </button>
            </div>
          </>
        )}

        {phase.kind === 'waiting' && (
          <WaitingForResponse
            toName={toDisplayName}
            outgoingStatus={outgoing?.status ?? 'pending'}
            expiresAt={phase.expiresAt}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

function WaitingForResponse({
  toName,
  outgoingStatus,
  expiresAt,
  onCancel,
}: {
  toName: string
  outgoingStatus: 'pending' | 'accepted' | 'declined' | 'ignored' | 'cancelled' | 'expired'
  expiresAt: number
  onCancel: () => void
}) {
  // Live countdown — re-renders twice a second so the timer feels alive.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(i)
  }, [])
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000))

  if (outgoingStatus === 'declined') {
    return (
      <>
        <h2 className="puc-invite__title">{toName} declined.</h2>
        <p className="puc-invite__sub">Maybe another time. Your 5 ✦ has already been spent.</p>
        <div className="puc-invite__actions">
          <button type="button" className="puc-invite__btn puc-invite__btn--primary" onClick={onCancel}>
            OK
          </button>
        </div>
      </>
    )
  }
  if (outgoingStatus === 'ignored') {
    return (
      <>
        <h2 className="puc-invite__title">{toName} didn't reply.</h2>
        <p className="puc-invite__sub">They saw the invite but kept playing. Try again later.</p>
        <div className="puc-invite__actions">
          <button type="button" className="puc-invite__btn puc-invite__btn--primary" onClick={onCancel}>
            OK
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <h2 className="puc-invite__title">Waiting for {toName}…</h2>
      <p className="puc-invite__sub">
        They have <b>{secondsLeft}s</b> to accept. We'll send you straight into
        the room when they do.
      </p>
      <div className="puc-invite__actions">
        <button type="button" className="puc-invite__btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  )
}
