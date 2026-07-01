// TowerDefenseScreen — hosts the standalone Tower Defense game (a static
// vanilla-JS build served from /public/tower-defense) in a full-viewport
// iframe. It's a "take a break" diversion reached from the Hall.
//
// The game is self-contained: its optional /api/* calls fall back to
// localStorage when no backend answers, so it runs fine under the castle
// domain. The app-wide <FloatingBack /> button (bottom-left on every
// non-Hall route) provides the return path — essential in PWA standalone
// mode where there's no browser chrome.
//
// We pass the Castle display name into the game via ?name= so the kid is
// never asked to type a name — the game uses who they already are here.

import { useCastle } from '../castle/useCastle'

export function TowerDefenseScreen() {
  const { identity } = useCastle()
  const name = identity?.displayName?.trim()
  const src = name
    ? `/tower-defense/index.html?name=${encodeURIComponent(name)}`
    : '/tower-defense/index.html'
  return (
    <iframe
      src={src}
      title="Tower Defense"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        border: 0,
        background: '#0b1410',
      }}
    />
  )
}
