// ChampionBanner — small strip under the Hall doors row showing the
// current weekly-tournament champion. Hidden when no champion is
// active. Tapping opens the champion's plaque so kids can poke around.

import { useNavigate } from 'react-router-dom'
import { useUserCard } from '../invitations/UserCardHost'
import { useCastle } from '../castle/useCastle'
import { useCurrentChampion } from './useCurrentChampion'
import './ChampionBanner.css'

export function ChampionBanner() {
  const { champion } = useCurrentChampion()
  const userCard = useUserCard()
  const navigate = useNavigate()
  const { identity } = useCastle()
  if (!champion) return null
  const daysLeft = Math.max(
    0,
    Math.ceil((champion.championUntil - Date.now()) / (24 * 60 * 60 * 1000)),
  )
  const reignSuffix =
    daysLeft <= 0
      ? ''
      : daysLeft === 1
        ? ' · 1 day left'
        : ` · ${daysLeft} days left`
  const canOpenPlaque = !!identity
  return (
    <section className="puc-champion-banner" aria-label="Weekly tournament champion">
      <span className="puc-champion-banner__icon" aria-hidden="true">🏆</span>
      <div className="puc-champion-banner__body">
        <span className="puc-champion-banner__label">This week's champion</span>
        {canOpenPlaque ? (
          <button
            type="button"
            className="puc-champion-banner__name"
            onClick={() => userCard.open(champion.normalizedName)}
            title={`View ${champion.displayName}'s plaque`}
          >
            {champion.displayName}
          </button>
        ) : (
          <span className="puc-champion-banner__name puc-champion-banner__name--plain">
            {champion.displayName}
          </span>
        )}
        <span className="puc-champion-banner__meta">{reignSuffix}</span>
      </div>
      <button
        type="button"
        className="puc-champion-banner__cta"
        onClick={() => navigate('/tournament')}
      >
        Tournament →
      </button>
    </section>
  )
}
