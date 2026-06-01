// Theme registry. Each entry maps to a CSS token file imported eagerly
// from main.tsx; the active theme is selected by setting `data-theme` on
// the document element.

export interface ThemeDescriptor {
  id: string
  name: string
  blurb: string
}

export const THEMES: ThemeDescriptor[] = [
  {
    id: 'magic-forest',
    name: 'Magic Forest',
    blurb: 'Aged parchment squares, deep moss, warm gold.',
  },
  {
    id: 'starry-universe',
    name: 'Starry Universe',
    blurb: 'Night-sky board, soft purples, constellation lines.',
  },
]

export const DEFAULT_THEME_ID = 'magic-forest'

/** Apply a theme by setting `data-theme` on the html element. Token files
 *  are statically imported at app boot so the switch is instant. */
export function applyTheme(id: string): void {
  if (typeof document === 'undefined') return
  const known = THEMES.some((t) => t.id === id)
  document.documentElement.setAttribute('data-theme', known ? id : DEFAULT_THEME_ID)
}
