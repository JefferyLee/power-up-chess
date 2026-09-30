// AvatarEditorDialog — modal that wraps the heraldic editor in
// "avatar mode" (no text controls). Renders a live preview, calls
// equipAvatar on save. Server is the source of truth — the Castle
// identity context picks up the change via its guest doc snapshot.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { callEquipAvatar, type TeamBadge } from '../firebase/callables'
import { TeamBadge as TeamBadgeView } from './TeamBadge'
import { BadgeEditor } from './BadgeEditor'
import './CreateTeamDialog.css'

import { friendlyError } from '../errors/friendlyError'
const DEFAULT_AVATAR: TeamBadge = {
  shape: 'shield-heater',
  layout: 'solid',
  bg: '#3a5b9c',
  bg2: '#9c3a3a',
  border: '#1a1530',
  symbol: 'king',
  symbolColor: '#f4c266',
}

interface Props {
  current: TeamBadge | undefined
  onClose: () => void
  onSaved?: (avatar: TeamBadge) => void
}

export function AvatarEditorDialog({ current, onClose, onSaved }: Props) {
  const [badge, setBadge] = useState<TeamBadge>(current ?? DEFAULT_AVATAR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const onSubmit = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await callEquipAvatar({ avatar: badge })
      onSaved?.(res.avatar)
      onClose()
    } catch (e) {
      setError(friendlyError(e, 'saving your avatar'))
    } finally {
      setBusy(false)
    }
  }, [busy, badge, onClose, onSaved])

  return createPortal(
    <div
      className="puc-newteam-overlay"
      role="dialog"
      aria-label="Edit avatar"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="puc-newteam">
        <header className="puc-newteam__head">
          <h2 className="puc-newteam__title">Your avatar crest</h2>
          <button
            type="button"
            className="puc-newteam__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >✕</button>
        </header>
        <div className="puc-newteam__body">
          <div className="puc-newteam__preview">
            <TeamBadgeView badge={badge} size={140} hideText />
          </div>
          <BadgeEditor badge={badge} onChange={setBadge} hideText />
        </div>
        <footer className="puc-newteam__foot">
          {error && <p className="puc-newteam__error">{error}</p>}
          <button
            type="button"
            className="puc-newteam__btn puc-newteam__btn--primary"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Equip this crest'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
