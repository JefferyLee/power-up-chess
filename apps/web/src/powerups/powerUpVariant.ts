// Shared variant type + random picker for the Power Up capture ceremony.
// Lives apart from the React component so react-refresh stays happy.

export type PowerUpVariant = 'classic' | 'lightning' | 'comet'

const VARIANTS: PowerUpVariant[] = ['classic', 'lightning', 'comet']

/** Pick a random ceremony variant per capture. */
export function pickPowerUpVariant(): PowerUpVariant {
  return VARIANTS[Math.floor(Math.random() * VARIANTS.length)]!
}
