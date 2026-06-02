// useRouteLocation — map the current URL to a LocationTag.
//
// Lets a single App-level usePresenceHeartbeat() cover every route
// instead of every screen wiring its own. New routes only need a case
// here; the heartbeat picks them up automatically.

import { matchPath, useLocation } from 'react-router-dom'
import type { LocationTag } from '../firebase/callables'

/** Map the current URL to a LocationTag. usePresenceHeartbeat already
 *  no-ops when there's no identity, so signed-out gate visitors don't
 *  publish even though the gate route maps to hall here. */
export function useRouteLocation(): LocationTag {
  const { pathname } = useLocation()

  // Puzzle Garden subroutes — solo activities first, then plot-with-param.
  if (matchPath('/puzzles/calibration', pathname))
    return { kind: 'puzzle-calibration' }
  if (matchPath('/puzzles/leaderboard', pathname))
    return { kind: 'puzzle-leaderboard' }
  if (matchPath('/puzzles/daily', pathname)) return { kind: 'puzzle-daily' }
  if (matchPath('/puzzles/legends', pathname)) return { kind: 'puzzle-legends' }
  if (matchPath('/puzzles/master', pathname)) return { kind: 'puzzle-garden' }
    // ↑ master tier shares the garden location tag for now (no separate
    // pulse entry). If we surface "in Master's Atrium" later, add a
    // dedicated 'puzzle-master' kind to LocationTag + setPresence.
  const plotMatch = matchPath('/puzzles/plot/:plot', pathname)
  if (plotMatch && plotMatch.params.plot) {
    return { kind: 'puzzle-plot', plot: plotMatch.params.plot }
  }
  // /puzzles itself + legacy /puzzles/:id → garden landing.
  if (matchPath('/puzzles', pathname)) return { kind: 'puzzle-garden' }
  if (matchPath('/puzzles/:id', pathname)) return { kind: 'puzzle-garden' }

  if (matchPath('/local', pathname)) return { kind: 'local' }
  if (matchPath('/ai', pathname)) return { kind: 'practice' }
  if (matchPath('/forest', pathname)) return { kind: 'forest' }

  // Chess + Wizard rooms — carry the id so spectators can follow.
  const chessMatch = matchPath('/r/:roomId', pathname)
  if (chessMatch && chessMatch.params.roomId) {
    return { kind: 'chess', roomId: chessMatch.params.roomId }
  }
  const wizardMatch = matchPath('/wizard/:roomId', pathname)
  if (wizardMatch && wizardMatch.params.roomId) {
    return { kind: 'wizard', roomId: wizardMatch.params.roomId }
  }

  // / (signed-in = Hall, signed-out = Gate but heartbeat skips), /wizard,
  // /history, /review, and anything else → count as in the Hall.
  return { kind: 'hall' }
}
