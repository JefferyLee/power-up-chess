// SpellBar — the four campaign spells with cooldown arcs and lock icons.
import type { CSSProperties } from 'react'
import { SPELL_DEFS } from '../sim/defs'
import type { SpellId, SpellState } from '../sim/types'
import { SPELL_IDS } from './useSimSnapshot'
import { SPELL_GLYPH } from './pieces'

interface Props {
  spells: Record<SpellId, SpellState>
  active: SpellId | null
  /** Map name that unlocks each spell, for the lock tooltip. */
  unlockMapName: (id: SpellId) => string
  onPick: (id: SpellId) => void
}

export function SpellBar({ spells, active, unlockMapName, onPick }: Props) {
  return (
    <div className="puc-siege-spells" role="toolbar" aria-label="Spells">
      {SPELL_IDS.map((id) => {
        const def = SPELL_DEFS[id]
        const st = spells[id]
        const locked = !st.unlocked
        const cooling = !locked && !st.ready
        const fraction = cooling ? Math.min(1, st.cooldown / def.cooldown) : 0
        const title = locked
          ? `${def.name} — win ${unlockMapName(id)} to learn it.`
          : cooling
            ? `${def.name} — ready in ${Math.ceil(st.cooldown)} s.`
            : `${def.name}: ${def.description}`
        const style = { '--puc-cd': `${Math.round(fraction * 360)}deg` } as CSSProperties
        return (
          <button
            key={id}
            type="button"
            className={
              'puc-siege-spell' +
              (active === id ? ' puc-siege-spell--active' : '') +
              (locked ? ' puc-siege-spell--locked' : '') +
              (cooling ? ' puc-siege-spell--cooling' : '')
            }
            disabled={locked || cooling}
            title={title}
            aria-label={title}
            aria-pressed={active === id}
            style={style}
            onClick={() => onPick(id)}
          >
            <span className="puc-siege-spell__glyph" aria-hidden="true">
              {locked ? '🔒' : SPELL_GLYPH[id]}
            </span>
            <span className="puc-siege-spell__name">{def.name}</span>
            {cooling && <span className="puc-siege-spell__timer">{Math.ceil(st.cooldown)}</span>}
          </button>
        )
      })}
    </div>
  )
}
