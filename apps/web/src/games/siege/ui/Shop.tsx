// Shop — six piece cards along the bottom. Tap one to hold it; the
// scene then shows a ghost + attack cells under the pointer.
import { TOWER_DEFS } from '../sim/defs'
import type { Modifier, TowerType } from '../sim/types'
import { PIECE_GLYPH, TOWER_ORDER, shopBlockReason } from './pieces'

interface Props {
  gold: number
  towerCount: number
  hasKing: boolean
  modifiers: ReadonlyArray<Modifier>
  held: TowerType | null
  onPick: (type: TowerType) => void
}

export function Shop({ gold, towerCount, hasKing, modifiers, held, onPick }: Props) {
  return (
    <div className="puc-siege-shop" role="toolbar" aria-label="Pieces">
      {TOWER_ORDER.map((type) => {
        const def = TOWER_DEFS[type]
        const reason = shopBlockReason(type, def.cost, gold, modifiers, towerCount, hasKing)
        const active = held === type
        return (
          <button
            key={type}
            type="button"
            className={
              'puc-siege-shop__card' +
              (active ? ' puc-siege-shop__card--held' : '') +
              (reason ? ' puc-siege-shop__card--blocked' : '')
            }
            disabled={reason !== null}
            title={reason ?? def.description}
            aria-pressed={active}
            onClick={() => onPick(type)}
          >
            <span className="puc-siege-shop__glyph" aria-hidden="true">{PIECE_GLYPH[type]}</span>
            <span className="puc-siege-shop__name">{def.name}</span>
            <span className="puc-siege-shop__cost">{def.cost}</span>
          </button>
        )
      })}
    </div>
  )
}
