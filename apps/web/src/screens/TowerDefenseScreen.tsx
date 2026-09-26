// TowerDefenseScreen — hosts the Siege (chess-themed tower defense) at
// /arcade/tower-defense. The game (three.js + R3F + sim) lives in its
// own chunk and is only fetched when a kid opens this door; the
// app-wide <FloatingBack /> button provides the return path.

import { lazy, Suspense } from 'react'

const SiegeScreen = lazy(() => import('../games/siege/ui/SiegeScreen'))

export function TowerDefenseScreen() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--puc-bg-deep, #07081a)',
            color: 'var(--puc-text-muted, #a9a8cc)',
            fontFamily: 'Cinzel, var(--puc-font-display, serif)',
            fontSize: 18,
          }}
        >
          Raising the walls…
        </div>
      }
    >
      <SiegeScreen />
    </Suspense>
  )
}
