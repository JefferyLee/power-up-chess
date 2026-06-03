// InviteDialog — the time-control picker the sender sees after pressing
// "Invite to play" on a User Card. Mirrors TimeControlDialog's UX so kids
// who've opened a normal chess room recognise the shape.
//
// On Send: calls callSendInvite which charges 5 CP server-side, creates
// the pending Firestore doc, and returns the inviteId + expiresAt. We
// surface a "Waiting for {name}..." toast inside the dialog while the
// outgoing-invite subscription watches for the recipient's response.

import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
  type TimeControlPreset,
} from '../clock/timeControl'
import { useCosmetics } from '../cosmetics/useCosmetics'
import { callSendInvite } from '../firebase/callables'
import { useOutgoingInviteContext } from './OutgoingInviteContext'
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
  | { kind: 'error'; message: string }

export function InviteDialog({
  toNormalizedName,
  toDisplayName,
  selfNormalizedName,
  onClose,
  onSent,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TIME_CONTROL_ID)
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' })
  const { setInviteId } = useOutgoingInviteContext()
  const cosmetics = useCosmetics()
  const selected =
    TIME_CONTROL_PRESETS.find((p) => p.id === selectedId) ?? TIME_CONTROL_PRESETS[0]!

  // Once the invite is in flight, the global SentInviteToast takes over
  // (it follows the sender across page navigations + handles the
  // accepted → navigate hand-off). The dialog itself can close
  // immediately so the sender isn't trapped behind a modal.
  const onSend = async (preset: TimeControlPreset) => {
    setPhase({ kind: 'sending' })
    try {
      const res = await callSendInvite({
        fromNormalizedName: selfNormalizedName,
        toNormalizedName,
        timeControl: preset.value,
        pieceSetId: cosmetics.pieceSetId,
      })
      setInviteId(res.inviteId)
      onSent()
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return createPortal(
    <div
      className="puc-invite"
      role="dialog"
      aria-label="Send chess invitation"
      onClick={(e) => { if (e.target === e.currentTarget && phase.kind !== 'sending') onClose() }}
    >
      <div className="puc-invite__card">
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
              disabled={phase.kind === 'sending'}
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
            onClick={onClose}
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
      </div>
    </div>,
    document.body,
  )
}
