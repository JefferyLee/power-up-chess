// RoomChooserDialog — the modal that opens when a kid taps the
// Online Chess or Wizard's Duel door in the Hall. Lists every room
// currently in `waiting` status for that kind, with a Join button
// per row, plus a "Open new room" CTA at the bottom that hands
// control back to the parent's existing open-room flow (the
// TimeControlDialog for chess, the WizardWarningDialog for wizard).
//
// Listing reads come from the shared useWaitingRooms hook; this
// component only renders + routes.

import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { NameLink } from '../invitations/NameLink'
import type { WaitingRoom } from './useWaitingRooms'
import './RoomChooserDialog.css'

interface Props {
  kind: 'chess' | 'wizard'
  rooms: ReadonlyArray<WaitingRoom>
  /** Caller's normalized name — used to filter rooms YOU opened (you
   *  can't join your own waiting room, and surfacing it would be
   *  confusing). */
  selfNormalizedName?: string
  /** Called when the kid picks "Open new room". The parent runs its
   *  existing open-room flow (TC dialog for chess, warning dialog for
   *  wizard). The chooser closes first. */
  onOpenNew: () => void
  onClose: () => void
}

function timeControlLabel(tc: WaitingRoom['timeControl']): string {
  if (!tc) return 'No clock'
  const mins = Math.round(tc.initialMs / 60_000)
  const inc = tc.incrementMs / 1000
  return inc > 0 ? `${mins} min + ${inc}s` : `${mins} min`
}

function ageLabel(createdAt: number, now: number): string {
  const secs = Math.max(0, Math.floor((now - createdAt) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
}

export function RoomChooserDialog({
  kind,
  rooms,
  selfNormalizedName,
  onOpenNew,
  onClose,
}: Props) {
  const navigate = useNavigate()
  const visible = rooms.filter(
    (r) => !selfNormalizedName || r.openerNormalizedName !== selfNormalizedName,
  )
  const now = Date.now()
  const title = kind === 'wizard' ? "Wizard's Duels open right now" : 'Chess rooms open right now'
  const subTitle = kind === 'wizard'
    ? 'Join one as the challenger, or open a fresh duel and wait.'
    : 'Join one to play as Black, or open a fresh room and wait.'
  const openLabel = kind === 'wizard' ? 'Open a new duel' : 'Open a new room'
  const joinPath = (roomId: string) =>
    kind === 'wizard' ? `/wizard/${roomId}` : `/r/${roomId}`

  return createPortal(
    <div
      className="puc-chooser"
      role="dialog"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`puc-chooser__card puc-chooser__card--${kind}`}>
        <header className="puc-chooser__head">
          <h2 className="puc-chooser__title">{title}</h2>
          <button
            type="button"
            className="puc-chooser__close"
            onClick={onClose}
            aria-label="Close"
          >✕</button>
        </header>
        <p className="puc-chooser__sub">{subTitle}</p>

        {visible.length === 0 ? (
          <p className="puc-chooser__empty">
            No one's waiting right now. Open one and the door will tell
            everyone else.
          </p>
        ) : (
          <ul className="puc-chooser__list">
            {visible.map((room) => (
              <li key={room.roomId} className="puc-chooser__row">
                <div className="puc-chooser__row-body">
                  <span className="puc-chooser__opener">
                    <NameLink
                      normalizedName={room.openerNormalizedName ?? null}
                      displayName={room.openerDisplayName}
                      className="puc-chooser__opener-link"
                    />
                  </span>
                  <span className="puc-chooser__meta">
                    {kind === 'chess'
                      ? <>{timeControlLabel(room.timeControl)} · {ageLabel(room.createdAt, now)}</>
                      : <>8 min fixed · {ageLabel(room.createdAt, now)}</>}
                  </span>
                </div>
                <button
                  type="button"
                  className={`puc-chooser__join puc-chooser__join--${kind}`}
                  onClick={() => { navigate(joinPath(room.roomId)); onClose() }}
                >
                  ▸ Join
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="puc-chooser__actions">
          <button
            type="button"
            className={`puc-chooser__btn puc-chooser__btn--primary puc-chooser__btn--${kind}`}
            onClick={() => { onClose(); onOpenNew() }}
          >
            {openLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
