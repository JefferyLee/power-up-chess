// ChampionCrown — inline 🏆 chip rendered when the given player is the
// current weekly-tournament champion. Used in chess-screen player
// cards (LocalGameScreen, OnlineGameScreen) where the name comes
// through as a plain string rather than a NameLink.

import { useIsCurrentChampion } from './useCurrentChampion'

interface Props {
  /** Lowercased lookup key. When null/undefined or stale (no match),
   *  the component renders nothing. */
  normalizedName?: string | null
}

export function ChampionCrown({ normalizedName }: Props) {
  const isChampion = useIsCurrentChampion(normalizedName)
  if (!isChampion) return null
  return (
    <span
      className="puc-name-link__crown"
      aria-label="Weekly tournament champion"
      title="Weekly tournament champion"
    >
      🏆
    </span>
  )
}
