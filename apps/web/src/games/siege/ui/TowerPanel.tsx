// TowerPanel — the selected piece: level, stats, upgrade / branch,
// promotion (pawns), targeting and sell. Every action goes straight to
// the sim; the 10 Hz snapshot brings the new numbers back.
import { useState } from 'react'
import { TOWER_DEFS } from '../sim/defs'
import type { Sim, Targeting, TowerDef, TowerLevel, TowerStats, TowerType } from '../sim/types'
import { PIECE_GLYPH, TOWER_ORDER } from './pieces'
import type { TowerSnapshot } from './useSimSnapshot'

interface Props {
  sim: Sim
  tower: TowerSnapshot
  gold: number
  onClose: () => void
  onSold: () => void
  onPromoted: (to: TowerType) => void
}

const TARGETING: ReadonlyArray<{ id: Targeting; label: string }> = [
  { id: 'first', label: 'First' },
  { id: 'last', label: 'Last' },
  { id: 'strongest', label: 'Strong' },
  { id: 'weakest', label: 'Weak' },
]

const SELL_FRACTION = 0.6

function statsFor(def: TowerDef, level: TowerLevel, branch: string | null): TowerStats {
  if (level === 3) {
    const b = def.branches.find((x) => x.id === branch) ?? def.branches[0]
    return b.stats
  }
  return level === 2 ? def.levels[1] : def.levels[0]
}

function statLines(def: TowerDef, s: TowerStats): string[] {
  const out: string[] = []
  if (s.aura) {
    out.push(`+${Math.round((s.aura.damageMult - 1) * 100)} % damage, +${Math.round((s.aura.rateMult - 1) * 100)} % speed to the eight around him`)
    if (s.aura.goldMult > 1) out.push(`+${Math.round((s.aura.goldMult - 1) * 100)} % gold on their captures`)
    return out
  }
  out.push(`${s.damage} damage · ${s.fireRate.toFixed(1)} shots/s`)
  if (def.pattern.kind === 'lines') out.push(`Reach ${s.range} cells, first enemy on each line`)
  if (s.splash) out.push(`Splash ${s.splash} cell`)
  if (s.slow) out.push(`Slows ${Math.round((1 - s.slow.factor) * 100)} % for ${s.slow.seconds} s`)
  if (s.burn) out.push(`Burns ${s.burn.dps}/s for ${s.burn.seconds} s`)
  if (s.pierce) out.push('Pierces armour')
  if (s.chain) out.push(`Chains to ${s.chain.targets} more`)
  return out
}

export function TowerPanel({ sim, tower, gold, onClose, onSold, onPromoted }: Props) {
  const [promoting, setPromoting] = useState(false)
  const def = TOWER_DEFS[tower.type]
  const stats = statsFor(def, tower.level, tower.branch)
  const branchDef = tower.level === 3 ? def.branches.find((b) => b.id === tower.branch) : undefined
  const upgrade = tower.level === 1 ? sim.canUpgrade(tower.id) : null
  const refund = Math.floor(tower.spent * SELL_FRACTION)
  const showTargeting = def.pattern.kind === 'cells'

  return (
    <aside className="puc-siege-panel" aria-label={`${def.name} piece`}>
      <header className="puc-siege-panel__head">
        <span className="puc-siege-panel__glyph" aria-hidden="true">{PIECE_GLYPH[tower.type]}</span>
        <div className="puc-siege-panel__title">
          <strong>{branchDef ? `${branchDef.name} ${def.name}` : def.name}</strong>
          <span className="puc-siege-panel__sub">
            Level {tower.level}
            {tower.buffed ? ' · rallied by the king' : ''}
            {tower.stunned ? ' · stunned' : ''}
          </span>
        </div>
        <button type="button" className="puc-siege-btn puc-siege-btn--icon" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <ul className="puc-siege-panel__stats">
        {statLines(def, stats).map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>{tower.kills} captures</li>
      </ul>

      {tower.level === 1 && upgrade && (
        <button
          type="button"
          className="puc-siege-btn puc-siege-btn--wide"
          disabled={!upgrade.ok}
          title={upgrade.reason ?? `Upgrade to level 2 for ${upgrade.cost} gold`}
          onClick={() => {
            sim.upgrade(tower.id)
          }}
        >
          Upgrade · {upgrade.cost}
        </button>
      )}

      {tower.level === 2 && (
        <div className="puc-siege-panel__branches">
          {def.branches.map((b) => (
            <button
              key={b.id}
              type="button"
              className="puc-siege-btn puc-siege-btn--branch"
              disabled={gold < b.cost}
              title={gold < b.cost ? `Needs ${b.cost} gold — you have ${gold}.` : b.description}
              onClick={() => {
                sim.chooseBranch(tower.id, b.id)
              }}
            >
              <strong>{b.name}</strong>
              <span>{b.description}</span>
              <em>{b.cost} gold</em>
            </button>
          ))}
        </div>
      )}

      {tower.type === 'pawn' && (
        <div className="puc-siege-panel__promote">
          <button
            type="button"
            className="puc-siege-btn puc-siege-btn--wide"
            aria-expanded={promoting}
            onClick={() => setPromoting((v) => !v)}
          >
            {promoting ? 'Keep it a pawn' : 'Promote…'}
          </button>
          {promoting && (
            <div className="puc-siege-panel__promote-list">
              {TOWER_ORDER.filter((t) => t !== 'pawn').map((to) => {
                const can = sim.canPromote(tower.id, to)
                return (
                  <button
                    key={to}
                    type="button"
                    className="puc-siege-btn"
                    disabled={!can.ok}
                    title={can.reason ?? `Promote to ${TOWER_DEFS[to].name} for ${can.cost} gold`}
                    onClick={() => {
                      if (sim.promote(tower.id, to)) {
                        setPromoting(false)
                        onPromoted(to)
                      }
                    }}
                  >
                    <span aria-hidden="true">{PIECE_GLYPH[to]}</span> {TOWER_DEFS[to].name} · {can.cost}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showTargeting && (
        <div className="puc-siege-panel__targeting" role="radiogroup" aria-label="Targeting">
          {TARGETING.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tower.targeting === t.id}
              className={'puc-siege-seg' + (tower.targeting === t.id ? ' puc-siege-seg--on' : '')}
              onClick={() => sim.setTargeting(tower.id, t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="puc-siege-btn puc-siege-btn--wide puc-siege-btn--sell"
        title={`Sell for ${refund} gold (60 % of ${tower.spent})`}
        onClick={() => {
          sim.sell(tower.id)
          onSold()
        }}
      >
        Sell · +{refund}
      </button>
      <p className="puc-siege-panel__gold">You have {gold} gold.</p>
    </aside>
  )
}
