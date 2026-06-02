// ShopScreen — the Theme Shop.
//
// MVP3 P1.D Slice 1: equip-only. Two free Unicode sets are switchable
// today; the Common / Rare / Master tier cards are visible but
// rendered as "Coming soon" so the pricing structure is in front of
// the kid even before the SVG sets land in Slice 2.

import { useNavigate } from 'react-router-dom'
import { useCastle } from '../castle/useCastle'
import { useCosmetics } from './useCosmetics'
import {
  PIECE_SETS,
  PIECE_SET_ORDER,
  PIECE_SET_TIER_LABEL,
  type PieceSet,
} from './pieceSets'
import type { PieceSymbol } from '../chess/types'
import './ShopScreen.css'

const PREVIEW_PIECES: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

export function ShopScreen() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const { pieceSetId, setPieceSetId } = useCosmetics()

  if (!identity) {
    return (
      <div className="puc-shop puc-shop--centered">
        <p>The Theme Shop is for signed-in guests.</p>
        <button
          type="button"
          className="puc-shop__btn"
          onClick={() => navigate('/')}
        >
          Back to entry
        </button>
      </div>
    )
  }

  return (
    <div className="puc-shop">
      <header className="puc-shop__header">
        <button
          type="button"
          className="puc-shop__back"
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <div className="puc-shop__title-wrap">
          <h1 className="puc-shop__title">Theme Shop</h1>
          <p className="puc-shop__sub">
            Pick the look of your chess pieces. More sets unlock soon.
          </p>
        </div>
        <div className="puc-shop__points" aria-label="Castle points">
          <span className="puc-shop__points-icon" aria-hidden="true">🏰</span>
          <span className="puc-shop__points-num">{identity.castlePoints}</span>
        </div>
      </header>

      <main className="puc-shop__main">
        <div className="puc-shop__grid">
          {PIECE_SET_ORDER.map((id) => (
            <PieceSetCard
              key={id}
              set={PIECE_SETS[id]}
              equipped={id === pieceSetId}
              onEquip={() => setPieceSetId(id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function PieceSetCard({
  set,
  equipped,
  onEquip,
}: {
  set: PieceSet
  equipped: boolean
  onEquip: () => void
}) {
  return (
    <article
      className={
        'puc-shop__card ' +
        `puc-shop__card--${set.tier} ` +
        (equipped ? 'puc-shop__card--equipped ' : '') +
        (set.locked ? 'puc-shop__card--locked' : '')
      }
    >
      <div
        className="puc-shop__card-preview"
        aria-label={`${set.label} preview`}
      >
        {PREVIEW_PIECES.map((p) => (
          <span
            key={p}
            className={`puc-piece puc-piece--w puc-shop__card-preview-piece puc-piece--set-${set.id}`}
          >
            {set.glyphFor(p, 'w')}
          </span>
        ))}
      </div>
      <div className="puc-shop__card-body">
        <div className="puc-shop__card-head">
          <h2 className="puc-shop__card-title">{set.label}</h2>
          <span
            className={`puc-shop__card-tier puc-shop__card-tier--${set.tier}`}
          >
            {PIECE_SET_TIER_LABEL[set.tier]}
          </span>
        </div>
        <p className="puc-shop__card-blurb">{set.blurb}</p>
      </div>
      <div className="puc-shop__card-actions">
        {set.locked ? (
          <span className="puc-shop__card-cta puc-shop__card-cta--locked">
            🔒 Coming soon · {set.priceCp} pts
          </span>
        ) : equipped ? (
          <span className="puc-shop__card-cta puc-shop__card-cta--equipped">
            ✓ Equipped
          </span>
        ) : (
          <button
            type="button"
            className="puc-shop__card-cta puc-shop__card-cta--equip"
            onClick={onEquip}
          >
            Equip
          </button>
        )}
      </div>
    </article>
  )
}
