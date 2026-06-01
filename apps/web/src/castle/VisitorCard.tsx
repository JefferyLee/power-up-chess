// VisitorCard — the guest's "this is me" card inside the Hall. Shows
// their chosen avatar, name, and current castle points. Clicking the
// avatar opens an AvatarPicker grid that lets them swap to any preset.

import { useState } from 'react'
import { useCastle } from './useCastle'
import { Avatar } from './Avatar'
import { AVATAR_META, DEFAULT_AVATAR_ID, type AvatarId } from './avatars'
import { loadProfile, setAvatarId } from '../storage/profile'
import './VisitorCard.css'

const UNLOCK_THRESHOLD = 200

export function VisitorCard() {
  const { identity } = useCastle()
  const [pickerOpen, setPickerOpen] = useState(false)
  // Read avatarId from profile on every render; profile.set is cheap.
  const profile = loadProfile()
  const avatarId = (profile.avatarId || DEFAULT_AVATAR_ID) as AvatarId

  if (!identity) return null

  const points = identity.castlePoints
  const toUnlock = Math.max(0, UNLOCK_THRESHOLD - points)
  const isBypass = identity.isBypass

  return (
    <>
      <section className="puc-visitor">
        <button
          type="button"
          className="puc-visitor__avatar"
          onClick={() => setPickerOpen(true)}
          title="Change your avatar"
          aria-label="Change your avatar"
        >
          <Avatar avatarId={avatarId} size={68} />
          <span className="puc-visitor__avatar-edit">✎</span>
        </button>
        <div className="puc-visitor__meta">
          <h3 className="puc-visitor__name">
            {isBypass ? '👻 ' : ''}{identity.displayName}
          </h3>
          {isBypass ? (
            <p className="puc-visitor__note">guest — points won&apos;t be saved</p>
          ) : (
            <>
              <p className="puc-visitor__points">
                <strong>{points}</strong>
                <span className="puc-visitor__points-label"> castle points</span>
              </p>
              {toUnlock > 0 && (
                <p className="puc-visitor__progress">
                  {toUnlock} more to open the chess rooms
                </p>
              )}
              {toUnlock === 0 && (
                <p className="puc-visitor__progress puc-visitor__progress--unlocked">
                  chess rooms unlocked ✓
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {pickerOpen && (
        <AvatarPicker
          current={avatarId}
          onPick={(id) => { setAvatarId(id); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}

function AvatarPicker({
  current,
  onPick,
  onClose,
}: {
  current: AvatarId
  onPick: (id: AvatarId) => void
  onClose: () => void
}) {
  return (
    <div className="puc-avatar-picker" role="dialog" aria-label="Choose your avatar">
      <div className="puc-avatar-picker__backdrop" onClick={onClose} />
      <div className="puc-avatar-picker__panel">
        <header className="puc-avatar-picker__header">
          <h2 className="puc-avatar-picker__title">Pick your avatar</h2>
          <button type="button" className="puc-avatar-picker__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="puc-avatar-picker__grid">
          {AVATAR_META.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`puc-avatar-picker__cell${a.id === current ? ' puc-avatar-picker__cell--current' : ''}`}
              onClick={() => onPick(a.id)}
              title={a.label}
            >
              <Avatar avatarId={a.id} size={72} />
              <span className="puc-avatar-picker__label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
