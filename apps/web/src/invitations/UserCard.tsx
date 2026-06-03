// UserCard — click-to-open profile modal triggered from the OnlineList.
//
// Loads a small public-profile slice via the getPublicProfile callable
// (the guests doc itself is read-locked per Firestore rules). Shows the
// person's title, balance, lifetime-earn, puzzles solved, current
// location, plus 2 buttons:
//
//   ▸ Watch — navigates the viewer to the user's current game (only
//     enabled if the user is currently in a chess or wizard room).
//   ▸ Invite to play — opens InviteDialog. Greyed when the user is in
//     a game or you don't have the 5 CP to send, with an explanatory
//     tooltip.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  callGetPublicProfile,
  type GetPublicProfileResponse,
  type LocationTag,
} from '../firebase/callables'
import { PlaqueCard } from '../me/PlaqueCard'
import { INVITE_COST_CP } from './types'
import { InviteDialog } from './InviteDialog'
import './UserCard.css'

interface Props {
  normalizedName: string
  /** Your own normalized name + balance — drives the "self" guard + the
   *  invite button's "you can't afford it" disabled state. */
  selfNormalizedName: string
  selfCastlePoints: number
  onClose: () => void
}

export function UserCard({ normalizedName, selfNormalizedName, selfCastlePoints, onClose }: Props) {
  const navigate = useNavigate()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; profile: GetPublicProfileResponse }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' })
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    callGetPublicProfile({ normalizedName })
      .then((profile) => {
        if (!cancelled) setState({ kind: 'ready', profile })
      })
      .catch((e) => {
        if (cancelled) return
        setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => { cancelled = true }
  }, [normalizedName])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isSelf = selfNormalizedName === normalizedName

  return createPortal(
    <div
      className="puc-user-card-overlay"
      role="dialog"
      aria-label="Player profile"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="puc-user-card">
        <button
          type="button"
          className="puc-user-card__close"
          onClick={onClose}
          aria-label="Close"
        >✕</button>

        {state.kind === 'loading' && (
          <p className="puc-user-card__loading">Loading profile…</p>
        )}

        {state.kind === 'error' && (
          <p className="puc-user-card__error">Couldn't load profile: {state.message}</p>
        )}

        {state.kind === 'ready' && (() => {
          const p = state.profile
          const locView = locationView(p.currentLocation)
          const inviteDisabled =
            isSelf || p.inGame || selfCastlePoints < INVITE_COST_CP
          const inviteTitle = isSelf
            ? "That's you."
            : p.inGame
              ? `${p.displayName} is in a game right now.`
              : selfCastlePoints < INVITE_COST_CP
                ? `Sending an invite costs ${INVITE_COST_CP} castle points; you have ${selfCastlePoints}.`
                : `Invite ${p.displayName} to play (${INVITE_COST_CP} ✦)`

          return (
            <>
              <PlaqueCard profile={p} />

              <p className="puc-user-card__location">
                {p.currentLocation
                  ? <>Currently <b>{locView.label}</b>{' '}
                      {locView.watchHref && (
                        <button
                          type="button"
                          className="puc-user-card__watch"
                          onClick={() => { navigate(locView.watchHref!); onClose() }}
                        >▸ Watch</button>
                      )}
                    </>
                  : <>Not online right now.</>}
              </p>

              {!isSelf && (
                <div className="puc-user-card__actions">
                  <button
                    type="button"
                    className="puc-user-card__btn puc-user-card__btn--primary"
                    onClick={() => setInviteOpen(true)}
                    disabled={inviteDisabled}
                    title={inviteTitle}
                  >
                    Invite to play ({INVITE_COST_CP} ✦)
                  </button>
                </div>
              )}

              {inviteOpen && (
                <InviteDialog
                  toNormalizedName={p.normalizedName}
                  toDisplayName={p.displayName}
                  selfNormalizedName={selfNormalizedName}
                  onClose={() => setInviteOpen(false)}
                  onSent={() => {
                    setInviteOpen(false)
                    onClose()
                  }}
                />
              )}
            </>
          )
        })()}
      </div>
    </div>,
    document.body,
  )
}

interface LocationView {
  label: string
  watchHref?: string
}

function locationView(loc: LocationTag | null): LocationView {
  if (!loc) return { label: 'offline' }
  switch (loc.kind) {
    case 'hall': return { label: 'in the Hall' }
    case 'chess': return { label: `in a chess game (${loc.roomId})`, watchHref: `/r/${loc.roomId}` }
    case 'wizard': return { label: `in a Wizard's Duel (${loc.roomId})`, watchHref: `/wizard/${loc.roomId}` }
    case 'puzzle-garden': return { label: 'in the Puzzle Garden' }
    case 'puzzle-plot': return { label: `in the ${loc.plot} plot` }
    case 'puzzle-daily': return { label: "doing Today's Five" }
    case 'puzzle-legends': return { label: 'in the Legends Hall' }
    case 'puzzle-calibration': return { label: 'calibrating puzzles' }
    case 'puzzle-leaderboard': return { label: 'looking at trophies' }
    case 'practice': return { label: 'practising vs AI' }
    case 'local': return { label: 'playing local chess' }
    case 'forest': return { label: 'in the Forest' }
  }
}
