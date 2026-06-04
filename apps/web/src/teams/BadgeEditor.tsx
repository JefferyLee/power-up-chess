// Heraldic badge editor — drives both team-badge creation and (slice
// 4b) user-avatar customisation. Renders chips/swatches for every
// axis of the TeamBadge config plus a "Roll the dice" button that
// randomises everything at once.
//
// Set hideText=true to hide the engraved-motto controls — avatars use
// this since individuals don't get monograms (yet).

import type { TeamBadge } from '../firebase/callables'
import { PALETTE, SHAPE_IDS, SYMBOL_IDS, TEXT_POSITIONS } from './TeamBadge'

const LAYOUT_IDS: Array<NonNullable<TeamBadge['layout']>> = [
  'solid', 'horizontal', 'vertical', 'quartered',
  'bend', 'chevron', 'chief', 'bordure',
]

interface Props {
  badge: TeamBadge
  onChange: (next: TeamBadge) => void
  hideText?: boolean
}

export function BadgeEditor({ badge, onChange, hideText }: Props) {
  const roll = () => onChange(randomBadge())

  return (
    <>
      <div className="puc-newteam__roll-row">
        <button
          type="button"
          className="puc-newteam__roll-btn"
          onClick={roll}
          title="Randomise every field"
        >
          🎲 Roll the dice
        </button>
      </div>

      <fieldset className="puc-newteam__group">
        <legend>Shape</legend>
        <div className="puc-newteam__chips">
          {SHAPE_IDS.map((s) => (
            <button
              type="button"
              key={s}
              className={'puc-newteam__chip' + (badge.shape === s ? ' puc-newteam__chip--on' : '')}
              onClick={() => onChange({ ...badge, shape: s as TeamBadge['shape'] })}
            >
              {labelForShape(s)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="puc-newteam__group">
        <legend>Layout</legend>
        <div className="puc-newteam__chips">
          {LAYOUT_IDS.map((l) => (
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
          {PALETTE.map((c) => (
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

      {needsBg2(badge.layout) && (
        <fieldset className="puc-newteam__group">
          <legend>Colour 2</legend>
          <div className="puc-newteam__chips">
            {PALETTE.map((c) => (
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
          {SYMBOL_IDS.map((s) => (
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
          {PALETTE.map((c) => (
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

      {!hideText && (
        <>
          <fieldset className="puc-newteam__group">
            <legend>Engraved text (optional)</legend>
            <div className="puc-newteam__chips">
              {TEXT_POSITIONS.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={'puc-newteam__chip' + ((badge.textPosition ?? 'none') === p ? ' puc-newteam__chip--on' : '')}
                  onClick={() => onChange({ ...badge, textPosition: p })}
                >
                  {labelForTextPosition(p)}
                </button>
              ))}
            </div>
          </fieldset>

          {badge.textPosition && badge.textPosition !== 'none' && (
            <>
              <label className="puc-newteam__field">
                <span>Text (≤ 12 chars, letters + digits)</span>
                <input
                  type="text"
                  value={badge.text ?? ''}
                  onChange={(e) => onChange({
                    ...badge,
                    text: e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12),
                  })}
                  maxLength={12}
                  placeholder="e.g. ADA"
                  autoComplete="off"
                />
              </label>

              <fieldset className="puc-newteam__group">
                <legend>Text colour</legend>
                <div className="puc-newteam__chips">
                  {PALETTE.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={'puc-newteam__swatch' + (badge.textColor === c ? ' puc-newteam__swatch--on' : '')}
                      style={{ background: c }}
                      onClick={() => onChange({ ...badge, textColor: c })}
                      aria-label={`Text ${c}`}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </>
      )}
    </>
  )
}

function needsBg2(layout: string | undefined): boolean {
  if (!layout || layout === 'solid') return false
  return true
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

/** Build a fully random badge — every axis randomised. */
function randomBadge(): TeamBadge {
  return {
    shape: pick(SHAPE_IDS) as TeamBadge['shape'],
    layout: pick(LAYOUT_IDS),
    bg: pick(PALETTE as readonly string[]),
    bg2: pick(PALETTE as readonly string[]),
    border: '#1a1530',
    symbol: pick(SYMBOL_IDS),
    symbolColor: pick(PALETTE as readonly string[]),
  }
}

function labelForShape(s: string): string {
  switch (s) {
    case 'shield-heater': return 'Heater'
    case 'shield-round':  return 'Round'
    case 'shield-pointed':return 'Pointed'
    case 'roundel':       return 'Roundel'
    case 'oval':          return 'Oval'
    case 'kite':          return 'Kite'
    case 'lozenge':       return 'Lozenge'
    case 'heart':         return 'Heart'
    default:              return s
  }
}

function labelForTextPosition(p: string): string {
  switch (p) {
    case 'none':  return 'No text'
    case 'chief': return 'Top band'
    case 'base':  return 'Banner below'
    default:      return p
  }
}
