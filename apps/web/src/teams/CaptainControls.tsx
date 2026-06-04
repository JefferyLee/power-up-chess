// Captain-only control panel on the Team page. Four actions:
//   • Edit name + motto
//   • Rebadge
//   • Repost recruit card to the Hall
//   • Transfer captain title to a member
//
// Each opens a small modal. All four wrap their respective callable
// + handle the rate-limit / permission errors the server throws.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  callPostTeamRecruitment,
  callRebadgeTeam,
  callRenameTeam,
  callTransferCaptain,
  type TeamBadge,
} from '../firebase/callables'
import type { Team, TeamMember } from './useTeam'
import { TeamBadge as TeamBadgeView } from './TeamBadge'
import { BadgeEditor } from './BadgeEditor'
import './CreateTeamDialog.css'
import './CaptainControls.css'

interface Props {
  team: Team
}

type ModalKind = null | 'edit-name' | 'rebadge' | 'transfer'

export function CaptainControls({ team }: Props) {
  const [modal, setModal] = useState<ModalKind>(null)
  const [reposting, setReposting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recruitNote, setRecruitNote] = useState<string | null>(null)

  const onRepost = async () => {
    if (reposting) return
    setReposting(true)
    setError(null)
    setRecruitNote(null)
    try {
      await callPostTeamRecruitment({ teamId: team.teamId })
      setRecruitNote('Posted to the Hall.')
      setTimeout(() => setRecruitNote(null), 4000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReposting(false)
    }
  }

  return (
    <section className="puc-cc">
      <h2 className="puc-team__roster-title">Captain controls</h2>
      <div className="puc-cc__grid">
        <button type="button" className="puc-cc__btn" onClick={() => setModal('edit-name')}>
          ✎ Edit name &amp; motto
        </button>
        <button type="button" className="puc-cc__btn" onClick={() => setModal('rebadge')}>
          ◈ Change badge
        </button>
        <button
          type="button"
          className="puc-cc__btn"
          onClick={onRepost}
          disabled={reposting}
        >
          ✦ {reposting ? 'Posting…' : 'Repost recruit card'}
        </button>
        <button
          type="button"
          className="puc-cc__btn"
          onClick={() => setModal('transfer')}
          disabled={team.memberCount < 2}
          title={team.memberCount < 2 ? 'No one to transfer to yet.' : 'Hand the title to a teammate'}
        >
          ⛵ Transfer captain
        </button>
      </div>
      {recruitNote && <p className="puc-cc__note puc-cc__note--ok">{recruitNote}</p>}
      {error && <p className="puc-cc__note puc-cc__note--err">{error}</p>}

      {modal === 'edit-name' && (
        <EditNameModal team={team} onClose={() => setModal(null)} />
      )}
      {modal === 'rebadge' && (
        <RebadgeModal team={team} onClose={() => setModal(null)} />
      )}
      {modal === 'transfer' && (
        <TransferModal team={team} onClose={() => setModal(null)} />
      )}
    </section>
  )
}

// ─── Edit name + motto ───────────────────────────────────────────────

function EditNameModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const [name, setName] = useState(team.name)
  const [motto, setMotto] = useState(team.motto ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const onSubmit = useCallback(async () => {
    if (busy) return
    if (name.trim().length < 2) {
      setError('Team name needs at least 2 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callRenameTeam({
        teamId: team.teamId,
        name: name.trim(),
        motto: motto.trim() || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [busy, name, motto, team.teamId, onClose])

  return createPortal(
    <div
      className="puc-newteam-overlay"
      role="dialog"
      aria-label="Edit team name"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="puc-newteam puc-cc__modal">
        <header className="puc-newteam__head">
          <h2 className="puc-newteam__title">Edit name &amp; motto</h2>
          <button
            type="button"
            className="puc-newteam__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >✕</button>
        </header>
        <div className="puc-newteam__body">
          <label className="puc-newteam__field">
            <span>Team name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoComplete="off"
            />
          </label>
          <label className="puc-newteam__field">
            <span>Motto (optional)</span>
            <input
              type="text"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          </label>
          <p className="puc-cc__note puc-cc__note--muted">
            Rename limited to once a week — pick wisely.
          </p>
        </div>
        <footer className="puc-newteam__foot">
          {error && <p className="puc-newteam__error">{error}</p>}
          <button
            type="button"
            className="puc-newteam__btn puc-newteam__btn--primary"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// ─── Rebadge ─────────────────────────────────────────────────────────

function RebadgeModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const [badge, setBadge] = useState<TeamBadge>(team.badge)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const onSubmit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await callRebadgeTeam({ teamId: team.teamId, badge })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="puc-newteam-overlay"
      role="dialog"
      aria-label="Change team badge"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="puc-newteam">
        <header className="puc-newteam__head">
          <h2 className="puc-newteam__title">Change badge</h2>
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
            <TeamBadgeView badge={badge} size={140} />
          </div>
          <BadgeEditor badge={badge} onChange={setBadge} />
          <p className="puc-cc__note puc-cc__note--muted">
            Badge changes are limited to once a week.
          </p>
        </div>
        <footer className="puc-newteam__foot">
          {error && <p className="puc-newteam__error">{error}</p>}
          <button
            type="button"
            className="puc-newteam__btn puc-newteam__btn--primary"
            onClick={onSubmit}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save new badge'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

// ─── Transfer captain ────────────────────────────────────────────────

function TransferModal({ team, onClose }: { team: Team; onClose: () => void }) {
  const candidates = team.members.filter((m) => m.normalizedName !== team.captainNormalizedName)
  const [pick, setPick] = useState<TeamMember | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const onSubmit = async () => {
    if (busy || !pick) return
    if (!confirm(
      `Hand the captain title to ${pick.displayName}? They'll be able to rename, rebadge, kick, and disband — you'll lose those powers.`,
    )) return
    setBusy(true)
    setError(null)
    try {
      await callTransferCaptain({ teamId: team.teamId, toNormalizedName: pick.normalizedName })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="puc-newteam-overlay"
      role="dialog"
      aria-label="Transfer captain"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="puc-newteam">
        <header className="puc-newteam__head">
          <h2 className="puc-newteam__title">Transfer captain</h2>
          <button
            type="button"
            className="puc-newteam__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >✕</button>
        </header>
        <div className="puc-newteam__body">
          <p className="puc-cc__note puc-cc__note--muted">
            Pick a teammate to inherit the title. This can't be undone unless they transfer back.
          </p>
          <ul className="puc-cc__candidates">
            {candidates.map((m) => (
              <li
                key={m.normalizedName}
                className={'puc-cc__candidate' + (pick?.normalizedName === m.normalizedName ? ' puc-cc__candidate--on' : '')}
                onClick={() => setPick(m)}
              >
                <span className="puc-cc__candidate-name">{m.displayName}</span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="puc-newteam__foot">
          {error && <p className="puc-newteam__error">{error}</p>}
          <button
            type="button"
            className="puc-newteam__btn puc-newteam__btn--primary"
            onClick={onSubmit}
            disabled={busy || !pick}
          >
            {busy ? 'Transferring…' : pick ? `Hand title to ${pick.displayName}` : 'Pick someone first'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
