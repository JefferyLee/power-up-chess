// TeamPage — public-read team profile. Captain controls (rename,
// badge, disband, kick) and the application/approval flow land in
// Slice 2/3; this slice is roster + badge + leave/disband only.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import {
  callApplyToTeam,
  callApproveApplication,
  callCancelApplication,
  callDeclineApplication,
  callDisbandTeam,
  callKickMember,
  callLeaveTeam,
} from '../firebase/callables'
import { useTeam } from './useTeam'
import { TeamBadge } from './TeamBadge'
import { CaptainControls } from './CaptainControls'
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
              {isCaptain && m.normalizedName !== team.captainNormalizedName && (
                <KickButton
                  teamId={team.teamId}
                  normalizedName={m.normalizedName}
                  displayName={m.displayName}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {isCaptain && <CaptainControls team={team} />}
      {isCaptain && <CaptainInbox teamId={team.teamId} />}

      {!isMember && identity && !identity.isBypass && team.memberCount < 20 && (
        <ApplyToTeamSection teamId={team.teamId} teamName={team.name} />
      )}

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

/** Pending applications inbox shown only to the captain. Live-subscribes
 *  to team_applications where teamId == this team & status == 'pending'. */
interface ApplicationRow {
  applicationId: string
  fromNormalizedName: string
  fromDisplayName: string
  pitch?: string
  createdAt: number
  expiresAt: number
  status: string
}

function CaptainInbox({ teamId }: { teamId: string }) {
  const [apps, setApps] = useState<ApplicationRow[] | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(
      collection(db, 'team_applications'),
      where('teamId', '==', teamId),
      where('status', '==', 'pending'),
    )
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now()
      const rows: ApplicationRow[] = []
      for (const d of snap.docs) {
        const a = d.data() as ApplicationRow
        if (a.expiresAt > now) rows.push(a)
      }
      rows.sort((a, b) => a.createdAt - b.createdAt)
      setApps(rows)
    }, (err) => {
      console.warn('CaptainInbox snapshot error', err)
      setApps([])
    })
    return () => unsub()
  }, [teamId])

  const onApprove = async (id: string) => {
    if (actingId) return
    setActingId(id)
    setError(null)
    try { await callApproveApplication({ applicationId: id }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setActingId(null) }
  }
  const onDecline = async (id: string) => {
    if (actingId) return
    setActingId(id)
    setError(null)
    try { await callDeclineApplication({ applicationId: id }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setActingId(null) }
  }

  if (apps === null) return null
  return (
    <section className="puc-team__inbox">
      <h2 className="puc-team__roster-title">
        Pending applications {apps.length > 0 && <span className="puc-team__inbox-count">({apps.length})</span>}
      </h2>
      {apps.length === 0 && (
        <p className="puc-team__empty">Nothing waiting for you. Share the recruit card to bring people in.</p>
      )}
      <ul className="puc-team__list">
        {apps.map((a) => (
          <li key={a.applicationId} className="puc-team__app">
            <div className="puc-team__app-row">
              <NameLink
                normalizedName={a.fromNormalizedName}
                displayName={a.fromDisplayName}
                className="puc-team__row-name"
              />
              <span className="puc-team__row-joined">{relativeTime(a.createdAt)}</span>
            </div>
            {a.pitch && <p className="puc-team__app-pitch">"{a.pitch}"</p>}
            <div className="puc-team__app-actions">
              <button
                type="button"
                className="puc-team__btn puc-team__btn--accept"
                onClick={() => onApprove(a.applicationId)}
                disabled={!!actingId}
              >
                Approve
              </button>
              <button
                type="button"
                className="puc-team__btn"
                onClick={() => onDecline(a.applicationId)}
                disabled={!!actingId}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="puc-team__error">{error}</p>}
    </section>
  )
}

function ApplyToTeamSection({ teamId, teamName }: { teamId: string; teamName: string }) {
  // Subscribe to my own pending application (if any) so the button
  // reflects the current state across devices.
  const { identity } = useCastle()
  const [pending, setPending] = useState<{ applicationId: string } | null>(null)
  const [pitch, setPitch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!identity || identity.isBypass) return
    const q = query(
      collection(db, 'team_applications'),
      where('teamId', '==', teamId),
      where('fromNormalizedName', '==', identity.normalizedName),
      where('status', '==', 'pending'),
    )
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now()
      const live = snap.docs
        .map((d) => d.data() as { applicationId: string; expiresAt: number })
        .find((a) => a.expiresAt > now)
      setPending(live ? { applicationId: live.applicationId } : null)
    })
    return () => unsub()
  }, [teamId, identity])

  const onApply = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await callApplyToTeam({ teamId, pitch: pitch.trim() || undefined })
      setPitch('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const onCancel = async () => {
    if (busy || !pending) return
    setBusy(true)
    setError(null)
    try { await callCancelApplication({ applicationId: pending.applicationId }) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  if (pending) {
    return (
      <section className="puc-team__apply">
        <p className="puc-team__apply-note">
          You've applied to <b>{teamName}</b> — waiting on the captain.
        </p>
        <button type="button" className="puc-team__btn" onClick={onCancel} disabled={busy}>
          Cancel application
        </button>
        {error && <p className="puc-team__error">{error}</p>}
      </section>
    )
  }
  return (
    <section className="puc-team__apply">
      <label className="puc-team__apply-field">
        <span>Pitch the captain (optional)</span>
        <input
          type="text"
          value={pitch}
          onChange={(e) => setPitch(e.target.value)}
          maxLength={120}
          placeholder="why you'd be a good teammate"
          autoComplete="off"
        />
      </label>
      <button
        type="button"
        className="puc-team__btn puc-team__btn--apply"
        onClick={onApply}
        disabled={busy}
      >
        {busy ? 'Sending…' : `Apply to join ${teamName}`}
      </button>
      {error && <p className="puc-team__error">{error}</p>}
    </section>
  )
}

function KickButton({
  teamId,
  normalizedName,
  displayName,
}: {
  teamId: string
  normalizedName: string
  displayName: string
}) {
  const [busy, setBusy] = useState(false)
  const onKick = async () => {
    if (busy) return
    if (!confirm(`Kick ${displayName} from the team?`)) return
    setBusy(true)
    try { await callKickMember({ teamId, normalizedName }) }
    catch (e) { alert(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return (
    <button
      type="button"
      className="puc-team__row-kick"
      onClick={onKick}
      disabled={busy}
      title={`Kick ${displayName}`}
      aria-label={`Kick ${displayName}`}
    >✕</button>
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
