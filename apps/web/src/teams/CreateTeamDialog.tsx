// CreateTeamDialog — minimal V1 modal: pick a name + motto + a couple
// of badge knobs (shape, two colours, symbol), confirm the 100 CP
// cost, submit.
//
// Slice 4 will replace the inline badge controls with the full
// heraldry builder; for now the kid picks from a small palette so the
// flow is shippable.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { callCreateTeam, type TeamBadge } from '../firebase/callables'
import { TeamBadge as TeamBadgeView } from './TeamBadge'
import { BadgeEditor } from './BadgeEditor'
import './CreateTeamDialog.css'

import { friendlyError } from '../errors/friendlyError'
const TEAM_CREATE_COST_CP = 100

interface Props {
  onClose: () => void
}

export function CreateTeamDialog({ onClose }: Props) {
  const navigate = useNavigate()
  const { identity, setCastlePoints } = useCastle()
  const [name, setName] = useState('')
  const [motto, setMotto] = useState('')
  const [badge, setBadge] = useState<TeamBadge>({
    shape: 'shield-heater',
    layout: 'solid',
    bg: '#3a5b9c',
    bg2: '#9c3a3a',
    border: '#1a1530',
    symbol: 'king',
    symbolColor: '#f4c266',
  })
  const [phase, setPhase] = useState<'idle' | 'creating' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase !== 'creating') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, phase])

  const canAfford = (identity?.castlePoints ?? 0) >= TEAM_CREATE_COST_CP
  const canSubmit = name.trim().length >= 2 && canAfford && phase !== 'creating'

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return
    setPhase('creating')
    setError(null)
    try {
      const res = await callCreateTeam({
        name: name.trim(),
        motto: motto.trim() || undefined,
        badge,
      })
      setCastlePoints(res.castlePoints)
      navigate(`/team/${res.teamId}`)
    } catch (err) {
      setPhase('error')
      setError(friendlyError(err, 'creating the team'))
    }
  }, [canSubmit, name, motto, badge, navigate, setCastlePoints])

  return createPortal(
    <div
      className="puc-newteam-overlay"
      role="dialog"
      aria-label="Create a team"
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'creating') onClose() }}
    >
      <div className="puc-newteam">
        <header className="puc-newteam__head">
          <h2 className="puc-newteam__title">Start a team</h2>
          <button
            type="button"
            className="puc-newteam__close"
            onClick={onClose}
            disabled={phase === 'creating'}
            aria-label="Close"
          >✕</button>
        </header>

        <div className="puc-newteam__body">
          <div className="puc-newteam__preview">
            <TeamBadgeView badge={badge} size={140} />
          </div>

          <label className="puc-newteam__field">
            <span>Team name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="e.g. Ada's Mateys"
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
              placeholder="We solve puzzles before bed"
              autoComplete="off"
            />
          </label>

          <BadgeEditor badge={badge} onChange={setBadge} />
        </div>

        <footer className="puc-newteam__foot">
          {error && <p className="puc-newteam__error">{error}</p>}
          <p className="puc-newteam__cost">
            {canAfford
              ? <>Costs <b>{TEAM_CREATE_COST_CP}</b> castle points. You have {identity?.castlePoints ?? 0}.</>
              : <>You need <b>{TEAM_CREATE_COST_CP}</b> castle points to start a team. You have {identity?.castlePoints ?? 0}.</>}
          </p>
          <button
            type="button"
            className="puc-newteam__btn puc-newteam__btn--primary"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {phase === 'creating' ? 'Hoisting the colours…' : 'Found the team'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

