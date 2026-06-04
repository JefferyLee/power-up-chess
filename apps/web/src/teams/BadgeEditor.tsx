// Shared badge-customisation control. Used by CreateTeamDialog and
// the Rebadge captain action. Renders chips/swatches for each axis
// of the TeamBadge config; parent owns the state.

import type { TeamBadge } from '../firebase/callables'

const SHAPES: Array<NonNullable<TeamBadge['shape']>> = [
  'shield-heater', 'shield-round', 'shield-pointed', 'roundel',
]
const LAYOUTS: Array<NonNullable<TeamBadge['layout']>> = ['solid', 'horizontal', 'vertical', 'quartered']
const BG_COLOURS = ['#3a5b9c', '#9c3a3a', '#3a9c5b', '#7c3a9c', '#9c7c3a', '#3a8a9c', '#2a2a4a', '#a14a8c']
const SYMBOL_COLOURS = ['#f4c266', '#ffffff', '#000000', '#ef9a3f', '#b8d4f4', '#f4b8d4']
const SYMBOLS = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn', 'crown', 'star', 'fire', 'lion']

interface Props {
  badge: TeamBadge
  onChange: (next: TeamBadge) => void
}

export function BadgeEditor({ badge, onChange }: Props) {
  return (
    <>
      <fieldset className="puc-newteam__group">
        <legend>Shape</legend>
        <div className="puc-newteam__chips">
          {SHAPES.map((s) => (
            <button
              type="button"
              key={s}
              className={'puc-newteam__chip' + (badge.shape === s ? ' puc-newteam__chip--on' : '')}
              onClick={() => onChange({ ...badge, shape: s })}
            >
              {labelForShape(s)}
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
              onClick={() => onChange({ ...badge, layout: l })}
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
              onClick={() => onChange({ ...badge, bg: c })}
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
                onClick={() => onChange({ ...badge, bg2: c })}
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
              onClick={() => onChange({ ...badge, symbol: s })}
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
              onClick={() => onChange({ ...badge, symbolColor: c })}
              aria-label={`Symbol ${c}`}
            />
          ))}
        </div>
      </fieldset>
    </>
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
