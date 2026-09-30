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
import { INVITE_COST_CP, WIZARD_INVITE_COST_CP } from './types'
import './InviteDialog.css'

import { friendlyError } from '../errors/friendlyError'
interface Props {
  toNormalizedName: string
  toDisplayName: string
  selfNormalizedName: string
  /** Variant to send. Wizard invites skip the time-control picker
   *  (fixed 8 min / 0 inc) and cost 10 ✦. */
  kind?: 'chess' | 'wizard'
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
  kind = 'chess',
  onClose,
  onSent,
}: Props) {
  const isWizard = kind === 'wizard'
  const cost = isWizard ? WIZARD_INVITE_COST_CP : INVITE_COST_CP
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
        // Wizard duels have a fixed clock — the picker is hidden in
        // that branch, and the server ignores any tc passed in.
        timeControl: isWizard ? null : preset.value,
        pieceSetId: cosmetics.pieceSetId,
        ...(isWizard ? { kind: 'wizard' as const } : {}),
      })
      setInviteId(res.inviteId)
      onSent()
    } catch (e) {
      setPhase({ kind: 'error', message: friendlyError(e, 'sending the invitation') })
    }
  }

  return createPortal(
    <div
      className="puc-invite"
      role="dialog"
      aria-label={isWizard ? 'Send Wizard\'s Duel invitation' : 'Send chess invitation'}
      onClick={(e) => { if (e.target === e.currentTarget && phase.kind !== 'sending') onClose() }}
    >
      <div className="puc-invite__card">
        <h2 className="puc-invite__title">
          {isWizard
            ? `Challenge ${toDisplayName} to a Wizard's Duel`
            : `Invite ${toDisplayName} to play`}
        </h2>
        <p className="puc-invite__sub">
          {isWizard ? (
            <>Fixed clock — 8 min, no increment. Sending costs <b>{cost} ✦</b>{' '}
              whether they accept, decline, or let it expire.</>
          ) : (
            <>Pick a time control. Sending costs <b>{cost} ✦</b> whether
              they accept, decline, or let it expire.</>
          )}
        </p>
        {!isWizard && (
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
        )}
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
              : `Send (${cost} ✦)`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
