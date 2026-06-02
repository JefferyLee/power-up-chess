// Spellbook side panel — one row per spell with icon, name, cost, and
// whether the current caster can afford it right now.

import { SPELLS } from './spells'
import type { Spell, SpellId } from './types'
import './Spellbook.css'

interface Props {
  /** Mana of the current caster. */
  mana: number
  /** Spell currently being targeted (mid-cast), highlighted. */
  activeSpell: SpellId | null
  /** Spells that can be cast right now (have enough mana AND ≥1 valid target). */
  castable: Set<SpellId>
  onPick: (spellId: SpellId) => void
}

const META: Record<SpellId, { icon: string; name: string; tag: string }> = {
  freeze:       { icon: '❄',  name: 'Freeze',      tag: '2 turns no move' },
  confuse:      { icon: '😵‍💫', name: 'Confuse',    tag: '2 turns no capture' },
  shield:       { icon: '🛡',  name: 'Shield',      tag: '2 turns uncapturable' },
  phantom:      { icon: '👻', name: 'Phantom',     tag: '1 turn pass-through' },
  teleport:     { icon: '✨', name: 'Teleport',    tag: 'swap 2 of your pieces' },
  summon:       { icon: '🪄', name: 'Summon Pawn', tag: 'drop a pawn in your half' },
  'extra-time': { icon: '⏳', name: 'Extra Time',  tag: '+1 min to your clock' },
}

export function Spellbook({ mana, activeSpell, castable, onPick }: Props) {
  return (
    <aside className="puc-spellbook">
      <h3 className="puc-spellbook__title">Spellbook</h3>
      <ul className="puc-spellbook__list">
        {SPELLS.map((s) => {
          const m = META[s.id]
          const canAfford = mana >= s.cost
          const isCastable = castable.has(s.id)
          const isActive = activeSpell === s.id
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`puc-spellbook__spell${isActive ? ' puc-spellbook__spell--active' : ''}${isCastable ? '' : ' puc-spellbook__spell--locked'}`}
                onClick={() => onPick(s.id)}
                disabled={!isCastable}
                title={isCastable ? 'Pick a target' : describeBlock(s, mana)}
              >
                <span className="puc-spellbook__icon" aria-hidden="true">{m.icon}</span>
                <span className="puc-spellbook__copy">
                  <span className="puc-spellbook__name">{m.name}</span>
                  <span className="puc-spellbook__tag">{m.tag}</span>
                </span>
                <span className={`puc-spellbook__cost${canAfford ? '' : ' puc-spellbook__cost--short'}`}>
                  {s.cost}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function describeBlock(s: Spell, mana: number): string {
  if (mana < s.cost) return `Needs ${s.cost} mana (you have ${mana})`
  return 'No legal target right now'
}
