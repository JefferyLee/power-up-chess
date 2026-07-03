// ShopScreen — the Theme Shop.
//
// MVP3 P1.D Slice 2: real economy. Free sets (classic, outline) stay
// equip-only. Cburnett ships with real SVG art and a 200-pt price tag;
// Fantasy + Glowing Crystal remain "Coming soon" placeholders until
// their assets land. Ownership is mirrored from Firestore via a guest
// doc subscription so the same guest sees their library after a
// purchase on any device.

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import { useCosmetics } from './useCosmetics'
import {
  PIECE_SETS,
  PIECE_SET_ORDER,
  PIECE_SET_TIER_LABEL,
  type PieceSet,
} from './pieceSets'
import {
  callEquipCosmetic,
  callPurchaseCosmetic,
} from '../firebase/callables'
import { useSound } from '../sound/useSound'
import type { PieceSymbol } from '../chess/types'
import './ShopScreen.css'

const PREVIEW_PIECES: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

const FREE_IDS = new Set(['classic', 'outline'])

interface GuestCosmeticsView {
  ownedPieceSets: string[]
}

export function ShopScreen() {
  const navigate = useNavigate()
  const { identity, setCastlePoints, setPieceSetId } = useCastle()
  const { pieceSetId } = useCosmetics()
  const sound = useSound()

  // Live owned-sets list from Firestore. Free sets are implicitly
  // owned and not stored, so the set is always {…purchased} only.
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!identity || identity.isBypass) return
    const ref = doc(db, 'guests', identity.normalizedName)
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as { cosmetics?: GuestCosmeticsView } | undefined
      setOwned(new Set(data?.cosmetics?.ownedPieceSets ?? []))
    })
    return () => unsub()
  }, [identity])

  const handleEquip = useCallback(
    async (id: string) => {
      if (!identity || !identity.sessionId) return
      setError(null)
      setBusyId(id)
      try {
        const res = await callEquipCosmetic({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          pieceSetId: id,
        })
        setPieceSetId(res.equippedPieceSet)
      } catch (err) {
        setError(messageFor(err))
      } finally {
        setBusyId(null)
      }
    },
    [identity, setPieceSetId],
  )

  const handleBuy = useCallback(
    async (id: string) => {
      if (!identity || !identity.sessionId) return
      setError(null)
      setBusyId(id)
      try {
        const res = await callPurchaseCosmetic({
          normalizedName: identity.normalizedName,
          sessionId: identity.sessionId,
          pieceSetId: id,
        })
        setCastlePoints(res.castlePoints)
        setPieceSetId(res.equippedPieceSet)
        sound.play('shop-purchase')
      } catch (err) {
        setError(messageFor(err))
      } finally {
        setBusyId(null)
      }
    },
    [identity, setCastlePoints, setPieceSetId, sound],
  )

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
  if (identity.isBypass) {
    return (
      <div className="puc-shop puc-shop--centered">
        <p className="puc-shop__error">
          Theme purchases need a real magic-word account. Bypass guests
          can&apos;t save cosmetics.
        </p>
        <button
          type="button"
          className="puc-shop__btn"
          onClick={() => navigate('/')}
        >
          Back to hall
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
            Pick the look of your chess pieces — 8 sets to collect.
          </p>
        </div>
        <div className="puc-shop__points" aria-label="Castle points">
          <span className="puc-shop__points-icon" aria-hidden="true">🏰</span>
          <span className="puc-shop__points-num">{identity.castlePoints}</span>
        </div>
      </header>

      {error && (
        <div className="puc-shop__error-banner" role="alert">
          {error}
        </div>
      )}

      <main className="puc-shop__main">
        <div className="puc-shop__grid">
          {PIECE_SET_ORDER.map((id) => {
            const set = PIECE_SETS[id]
            const equipped = id === pieceSetId
            const isFree = FREE_IDS.has(id)
            const isOwned = isFree || owned.has(id)
            return (
              <PieceSetCard
                key={id}
                set={set}
                equipped={equipped}
                owned={isOwned}
                affordable={identity.castlePoints >= set.priceCp}
                busy={busyId === id}
                onEquip={() => handleEquip(id)}
                onBuy={() => handleBuy(id)}
              />
            )
          })}
        </div>
      </main>
    </div>
  )
}

function PieceSetCard({
  set,
  equipped,
  owned,
  affordable,
  busy,
  onEquip,
  onBuy,
}: {
  set: PieceSet
  equipped: boolean
  owned: boolean
  affordable: boolean
  busy: boolean
  onEquip: () => void
  onBuy: () => void
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
        <CardCta
          set={set}
          equipped={equipped}
          owned={owned}
          affordable={affordable}
          busy={busy}
          onEquip={onEquip}
          onBuy={onBuy}
        />
      </div>
    </article>
  )
}

function CardCta({
  set,
  equipped,
  owned,
  affordable,
  busy,
  onEquip,
  onBuy,
}: {
  set: PieceSet
  equipped: boolean
  owned: boolean
  affordable: boolean
  busy: boolean
  onEquip: () => void
  onBuy: () => void
}) {
  if (set.locked) {
    return (
      <span className="puc-shop__card-cta puc-shop__card-cta--locked">
        🔒 Coming soon · {set.priceCp} pts
      </span>
    )
  }
  if (equipped) {
    return (
      <span className="puc-shop__card-cta puc-shop__card-cta--equipped">
        ✓ Equipped
      </span>
    )
  }
  if (owned) {
    return (
      <button
        type="button"
        className="puc-shop__card-cta puc-shop__card-cta--equip"
        onClick={onEquip}
        disabled={busy}
      >
        {busy ? 'Equipping…' : 'Equip'}
      </button>
    )
  }
  // Purchasable
  return (
    <button
      type="button"
      className="puc-shop__card-cta puc-shop__card-cta--buy"
      onClick={onBuy}
      disabled={busy || !affordable}
      title={
        !affordable
          ? `Earn ${set.priceCp - 0} castle points to unlock this set.`
          : undefined
      }
    >
      {busy
        ? 'Buying…'
        : affordable
          ? `Buy for ${set.priceCp} pts`
          : `Need ${set.priceCp} pts`}
    </button>
  )
}

function messageFor(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: string }).message)
  }
  return 'Something went wrong. Try again.'
}
