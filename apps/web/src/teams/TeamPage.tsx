// TeamPage — public-read team profile. Captain controls (rename,
// badge, disband, kick) and the application/approval flow land in
// Slice 2/3; this slice is roster + badge + leave/disband only.

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { callDisbandTeam, callLeaveTeam } from '../firebase/callables'
import { useTeam } from './useTeam'
import { TeamBadge } from './TeamBadge'
import { NameLink } from '../invitations/NameLink'
import './TeamPage.css'

export function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const { identity } = useCastle()
  const state = useTeam(teamId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.kind === 'loading') {
    return <div className="puc-team-page"><p className="puc-team__loading">Loading team…</p></div>
  }
  if (state.kind === 'gone') {
    return (
      <div className="puc-team-page">
        <p className="puc-team__loading">This team doesn&apos;t exist (or was disbanded).</p>
        <button type="button" className="puc-team__back" onClick={() => navigate('/')}>← Hall</button>
      </div>
    )
  }
  if (state.kind === 'error') {
    return <div className="puc-team-page"><p className="puc-team__loading">{state.message}</p></div>
  }

  const team = state.team
  const isMember = !!identity && team.members.some((m) => m.normalizedName === identity.normalizedName)
  const isCaptain = !!identity && team.captainNormalizedName === identity.normalizedName
  const onlyMember = team.memberCount <= 1

  const onLeave = async () => {
    if (!teamId || busy) return
    if (!confirm(`Leave "${team.name}"? You can apply again later if you change your mind.`)) return
    setBusy(true)
    setError(null)
    try {
      await callLeaveTeam({ teamId })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const onDisband = async () => {
    if (!teamId || busy) return
    const msg = onlyMember
      ? `Disband "${team.name}"? It will be gone for good.`
      : `Disband "${team.name}"? ${team.memberCount} members will lose the team. This can't be undone.`
    if (!confirm(msg)) return
    setBusy(true)
    setError(null)
    try {
      await callDisbandTeam({ teamId })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="puc-team-page">
      <button type="button" className="puc-team__back" onClick={() => navigate('/')}>← Hall</button>

      <header className="puc-team__head">
        <div className="puc-team__badge-wrap">
          <TeamBadge badge={team.badge} size={120} />
        </div>
        <div className="puc-team__id">
          <h1 className="puc-team__name">{team.name}</h1>
          {team.motto && <p className="puc-team__motto">"{team.motto}"</p>}
          <p className="puc-team__captain">
            Captain: <NameLink
              normalizedName={team.captainNormalizedName}
              displayName={team.captainDisplayName}
              className="puc-team__captain-link"
            />
          </p>
          <p className="puc-team__count">
            {team.memberCount} / 20 members
          </p>
        </div>
      </header>

      <section className="puc-team__roster">
        <h2 className="puc-team__roster-title">Roster</h2>
        <ul className="puc-team__list">
          {team.members.map((m) => (
            <li key={m.normalizedName} className="puc-team__row">
              {m.normalizedName === team.captainNormalizedName && (
                <span className="puc-team__captain-pip" title="Captain">⚓</span>
              )}
              <NameLink
                normalizedName={m.normalizedName}
                displayName={m.displayName}
                className="puc-team__row-name"
              />
              <span className="puc-team__row-joined">
                joined {relativeTime(m.joinedAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(isMember || isCaptain) && (
        <section className="puc-team__actions">
          {isMember && !isCaptain && (
            <button
              type="button"
              className="puc-team__btn"
              onClick={onLeave}
              disabled={busy}
            >
              Leave team
            </button>
          )}
          {isCaptain && (
            <button
              type="button"
              className="puc-team__btn puc-team__btn--danger"
              onClick={onDisband}
              disabled={busy}
            >
              Disband team
            </button>
          )}
          {error && <p className="puc-team__error">{error}</p>}
        </section>
      )}
    </div>
  )
}

function relativeTime(ts: number): string {
  const delta = Date.now() - ts
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
