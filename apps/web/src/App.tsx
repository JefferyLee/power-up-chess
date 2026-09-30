import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, matchRoutes, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CastleIdentityProvider } from './castle/CastleIdentityContext'
import { CurrentChampionProvider } from './tournament/useCurrentChampion'
import { CastleEntry } from './castle/CastleEntry'
import { FloatingBack } from './nav/FloatingBack'
import { usePresenceHeartbeat } from './castle/usePresenceHeartbeat'
import { useRouteLocation } from './castle/useRouteLocation'
import { trackScreen } from './firebase/analytics'
import { InviteInbox } from './invitations/InviteInbox'
import { OutgoingInviteProvider } from './invitations/OutgoingInviteContext'
import { SentInviteToast } from './invitations/SentInviteToast'
import { UserCardHost } from './invitations/UserCardHost'
import { ROUTES } from './routes'

/** Single source of truth for presence — runs at the App root so every
 *  authenticated route auto-publishes a location to lobby/presence
 *  without each screen wiring its own heartbeat. */
function GlobalPresenceHeartbeat() {
  const location = useRouteLocation()
  usePresenceHeartbeat(location)
  return null
}

/** Mirror of GlobalPresenceHeartbeat for Firebase Analytics — fires a
 *  screen_view event on every URL change. Pathname-only (no query / hash)
 *  so the GA4 property doesn't see room ids etc. */
function GlobalScreenTracker() {
  const { pathname } = useLocation()
  useEffect(() => {
    trackScreen(genericScreenName(pathname))
  }, [pathname])
  return null
}

const ROUTE_PATTERNS = ROUTES.map((r) => ({ path: r.path }))
const NAME_BY_PATH = new Map(ROUTES.map((r) => [r.path, r.name]))

/** Resolve the URL to the registry's screen name so /r/abc and /r/xyz
 *  both report as "chess_room" — keeps the GA event taxonomy small +
 *  privacy-friendly (no room ids, player names or team ids). */
function genericScreenName(pathname: string): string {
  if (pathname === '/') return 'castle_gate_or_hall'
  const matched = matchRoutes(ROUTE_PATTERNS, pathname)?.[0]?.route.path
  return (matched && NAME_BY_PATH.get(matched)) ?? pathname
}

/** Shown for the moment a door's code takes to arrive. Navigations run
 *  as transitions, so on a warm cache this never paints at all. */
function DoorOpening() {
  return (
    <p role="status" style={{ margin: '3rem auto', textAlign: 'center', opacity: 0.75 }}>
      Opening the door…
    </p>
  )
}

const LAZY_ROUTES = ROUTES.map((r) => ({ path: r.path, Screen: lazy(r.load) }))

export function App() {
  return (
    <BrowserRouter>
      <CastleIdentityProvider>
        <CurrentChampionProvider>
        <OutgoingInviteProvider>
        <UserCardHost>
        <GlobalPresenceHeartbeat />
        <GlobalScreenTracker />
        <InviteInbox />
        <SentInviteToast />
        <FloatingBack />
        <Suspense fallback={<DoorOpening />}>
          <Routes>
            {/* The castle gate is the first paint — eager on purpose. */}
            <Route path="/" element={<CastleEntry />} />
            {LAZY_ROUTES.map(({ path, Screen }) => (
              <Route key={path} path={path} element={<Screen />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </UserCardHost>
        </OutgoingInviteProvider>
        </CurrentChampionProvider>
      </CastleIdentityProvider>
    </BrowserRouter>
  )
}
