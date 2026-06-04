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
import './CreateTeamDialog.css'

const TEAM_CREATE_COST_CP = 100

const SHAPES: Array<TeamBadge['shape']> = [
  'shield-heater', 'shield-round', 'shield-pointed', 'roundel',
]
const LAYOUTS: Array<TeamBadge['layout']> = ['solid', 'horizontal', 'vertical', 'quartered']
const BG_COLOURS = ['#3a5b9c', '#9c3a3a', '#3a9c5b', '#7c3a9c', '#9c7c3a', '#3a8a9c', '#2a2a4a', '#a14a8c']
const SYMBOL_COLOURS = ['#f4c266', '#ffffff', '#000000', '#ef9a3f', '#b8d4f4', '#f4b8d4']
const SYMBOLS = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'crown', 'star', 'fire', 'lion']

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
      setError(err instanceof Error ? err.message : String(err))
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

          <fieldset className="puc-newteam__group">
            <legend>Shape</legend>
            <div className="puc-newteam__chips">
              {SHAPES.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={'puc-newteam__chip' + (badge.shape === s ? ' puc-newteam__chip--on' : '')}
                  onClick={() => setBadge({ ...badge, shape: s })}
                >
                  {labelForShape(s!)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="puc-newteam__group">
            <legend>Layout</legend>
            <div className="puc-newteam__chips">
              {LAYOUTS.map((l) => (
                <button
                  type="button"
                  key={l}
                  className={'puc-newteam__chip' + (badge.layout === l ? ' puc-newteam__chip--on' : '')}
                  onClick={() => setBadge({ ...badge, layout: l })}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="puc-newteam__group">
            <legend>Colour 1</legend>
            <div className="puc-newteam__chips">
              {BG_COLOURS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={'puc-newteam__swatch' + (badge.bg === c ? ' puc-newteam__swatch--on' : '')}
                  style={{ background: c }}
                  onClick={() => setBadge({ ...badge, bg: c })}
                  aria-label={`Background ${c}`}
                />
              ))}
            </div>
          </fieldset>

          {(badge.layout && badge.layout !== 'solid') && (
            <fieldset className="puc-newteam__group">
              <legend>Colour 2</legend>
              <div className="puc-newteam__chips">
                {BG_COLOURS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={'puc-newteam__swatch' + (badge.bg2 === c ? ' puc-newteam__swatch--on' : '')}
                    style={{ background: c }}
                    onClick={() => setBadge({ ...badge, bg2: c })}
                    aria-label={`Secondary ${c}`}
                  />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="puc-newteam__group">
            <legend>Symbol</legend>
            <div className="puc-newteam__chips">
              {SYMBOLS.map((s) => (
                <button
                  type="button"
                  key={s}
                  className={'puc-newteam__chip' + (badge.symbol === s ? ' puc-newteam__chip--on' : '')}
                  onClick={() => setBadge({ ...badge, symbol: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="puc-newteam__group">
            <legend>Symbol colour</legend>
            <div className="puc-newteam__chips">
              {SYMBOL_COLOURS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={'puc-newteam__swatch' + (badge.symbolColor === c ? ' puc-newteam__swatch--on' : '')}
                  style={{ background: c }}
                  onClick={() => setBadge({ ...badge, symbolColor: c })}
                  aria-label={`Symbol ${c}`}
                />
              ))}
            </div>
          </fieldset>
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

function labelForShape(s: NonNullable<TeamBadge['shape']>): string {
  switch (s) {
    case 'shield-heater': return 'Heater'
    case 'shield-round': return 'Round'
    case 'shield-pointed': return 'Pointed'
    case 'roundel': return 'Roundel'
  }
}
