// VisitorCard — the guest's "this is me" card inside the Hall. Shows
// their heraldic crest, name, and current castle points. Clicking the
// crest opens the AvatarEditorDialog (slice 4b workshop in avatar
// mode — no engraved text). Identity changes propagate via
// CastleIdentityContext's guest-doc snapshot so we just read whatever
// the cached identity says.

import { useState } from 'react'
import { useCastle } from './useCastle'
import { AvatarEditorDialog } from '../teams/AvatarEditorDialog'
import { TeamBadge } from '../teams/TeamBadge'
import type { TeamBadge as TeamBadgeConfig } from '../firebase/callables'
import './VisitorCard.css'

const UNLOCK_THRESHOLD = 200

export function VisitorCard() {
  const { identity } = useCastle()
  const [pickerOpen, setPickerOpen] = useState(false)

  if (!identity) return null

  const points = identity.castlePoints
  const toUnlock = Math.max(0, UNLOCK_THRESHOLD - points)
  const isBypass = identity.isBypass
  const avatar = (identity.cosmetics?.avatar as unknown as TeamBadgeConfig | undefined) ?? undefined
  // Bypass guests can't equip server-side avatars; just render the
  // default for them.

  return (
    <>
      <section className="puc-visitor">
        <button
          type="button"
          className="puc-visitor__avatar"
          onClick={() => { if (!isBypass) setPickerOpen(true) }}
          title={isBypass ? 'Guests use the default crest' : 'Change your crest'}
          aria-label={isBypass ? 'Default crest' : 'Change your crest'}
          disabled={isBypass}
        >
          <TeamBadge badge={avatar} size={68} hideText />
          {!isBypass && <span className="puc-visitor__avatar-edit">✎</span>}
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
        <AvatarEditorDialog
          current={avatar}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  )
}
