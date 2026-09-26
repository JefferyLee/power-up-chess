// themes — the five hall palettes for the Siege table. Same recipe as
// Board3D's dark hall (solid backdrop + matching fog, warm key, cool
// rim); cell tones are specified dark because flat colours render
// ~+30 sRGB brighter under the scene lights.
import type { Theme } from '../sim/types'

export interface ThemePalette {
  bg: string
  ground: string
  /** The slab under the cells. */
  frame: string
  light: string
  dark: string
  road: string
  wall: string
  chevron: string
  ambient: number
  /** Side fill light — lava's orange glow lives here. */
  fill: string
  fillIntensity: number
}

export const THEMES: Record<Theme, ThemePalette> = {
  courtyard: { bg: '#120e0b', ground: '#1c1511', frame: '#3b2a1c', light: '#a8894f', dark: '#6e4b2c', road: '#4a4038', wall: '#2a221b', chevron: '#f3e2b8', ambient: 0.42, fill: '#ffdcae', fillIntensity: 11 },
  forest: { bg: '#0b120c', ground: '#131c12', frame: '#2a3320', light: '#7f9a56', dark: '#4b6a38', road: '#54503e', wall: '#242e1e', chevron: '#e6f0c8', ambient: 0.4, fill: '#d6e8b0', fillIntensity: 9 },
  frost: { bg: '#0e1420', ground: '#172233', frame: '#33455a', light: '#c6d6e3', dark: '#7f9bb5', road: '#5a6a7c', wall: '#2a3a4e', chevron: '#ffffff', ambient: 0.5, fill: '#cfe6ff', fillIntensity: 9 },
  lava: { bg: '#0d0908', ground: '#160f0d', frame: '#2a1a14', light: '#5a4a44', dark: '#3a2c28', road: '#5a2a14', wall: '#1a1210', chevron: '#ffb070', ambient: 0.36, fill: '#ff6a1a', fillIntensity: 16 },
  throne: { bg: '#0c0716', ground: '#150d22', frame: '#2a1b40', light: '#6d5b8f', dark: '#3d2c60', road: '#3a3048', wall: '#1c1330', chevron: '#f1c34c', ambient: 0.42, fill: '#e8c66a', fillIntensity: 10 },
}
