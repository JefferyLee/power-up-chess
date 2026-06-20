import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LocalGameRoute } from './screens/LocalGameRoute'
import { OnlineGameScreen } from './screens/OnlineGameScreen'
import { PostGameAnalysisScreen } from './screens/PostGameAnalysisScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { PlayerGamesScreen } from './screens/PlayerGamesScreen'
import { GameArchiveScreen } from './screens/GameArchiveScreen'
import { PuzzleGardenScreen } from './puzzles/PuzzleGardenScreen'
import { PlotScreen } from './puzzles/PlotScreen'
import { CalibrationScreen } from './puzzles/CalibrationScreen'
import { LeaderboardScreen } from './puzzles/LeaderboardScreen'
import { DailyFiveScreen } from './puzzles/DailyFiveScreen'
import { LegendsHallScreen } from './puzzles/LegendsHallScreen'
import { MasterAtriumScreen } from './puzzles/MasterAtriumScreen'
import { LearnRoute } from './learn/LearnRoute'
import { LessonScreen } from './learn/LessonScreen'
import { AiPracticeRoute } from './screens/AiPracticeRoute'
import { CastleIdentityProvider } from './castle/CastleIdentityContext'
import { CurrentChampionProvider } from './tournament/useCurrentChampion'
import { CastleEntry } from './castle/CastleEntry'
import { ForestRoute } from './games/forest/ForestRoute'
import { WizardDuelRoute, WizardRoomRoute } from './games/wizard/WizardDuelRoute'
import { WizardV2Route } from './games/wizardv2/WizardV2Route'
import { WizardWarningGate } from './games/wizard/WizardWarningGate'
import { ShopScreen } from './cosmetics/ShopScreen'
import { LibraryRoute } from './library/LibraryRoute'
import { KnightsHopRoute } from './games/knightshop/KnightsHopRoute'
import { KnightsRunRoute } from './games/knightsrun/KnightsRunRoute'
import { EndgameRoute } from './endgame/EndgameRoute'
import { EndgameLessonScreen } from './endgame/EndgameLessonScreen'
import { OpeningsRoute } from './openings/OpeningsRoute'
import { OpeningLessonScreen } from './openings/OpeningLessonScreen'
import { TournamentRoute } from './tournament/TournamentRoute'
import { AdventurerPlaqueScreen } from './me/AdventurerPlaqueScreen'
import { TeamPage } from './teams/TeamPage'
import { FloatingBack } from './nav/FloatingBack'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePresenceHeartbeat } from './castle/usePresenceHeartbeat'
import { useRouteLocation } from './castle/useRouteLocation'
import { trackScreen } from './firebase/analytics'
import { InviteInbox } from './invitations/InviteInbox'
import { OutgoingInviteProvider } from './invitations/OutgoingInviteContext'
import { SentInviteToast } from './invitations/SentInviteToast'
import { UserCardHost } from './invitations/UserCardHost'

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

/** Strip dynamic ids out of the URL so /r/abc and /r/xyz both report as
 *  "chess_room" — keeps the GA event taxonomy small + privacy-friendly. */
function genericScreenName(pathname: string): string {
  if (pathname === '/') return 'castle_gate_or_hall'
  if (pathname.startsWith('/r/')) return 'chess_room'
  if (pathname.startsWith('/wizard/')) return 'wizard_room'
  if (pathname.startsWith('/puzzles/plot/')) return 'puzzle_plot'
  if (pathname.startsWith('/puzzles/') && pathname !== '/puzzles')
    return pathname.replace(/\/[^/]+$/, '') + '/_'
  if (pathname.startsWith('/learn/') && pathname !== '/learn')
    return 'lesson'
  if (pathname.startsWith('/openings/') && pathname !== '/openings')
    return 'opening_lesson'
  if (pathname.startsWith('/endgame/') && pathname !== '/endgame')
    return 'endgame_lesson'
  return pathname
}

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
        <Routes>
          <Route path="/" element={<CastleEntry />} />
          <Route path="/local" element={<LocalGameRoute />} />
          <Route path="/ai" element={<AiPracticeRoute />} />
          <Route path="/r/:roomId" element={<OnlineGameScreen />} />
          <Route path="/review" element={<PostGameAnalysisScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/history/:name" element={<PlayerGamesScreen />} />
          <Route path="/archive" element={<GameArchiveScreen />} />
          <Route path="/learn" element={<LearnRoute />} />
          <Route path="/learn/:lessonId" element={<LessonScreen />} />
          <Route path="/puzzles" element={<PuzzleGardenScreen />} />
          <Route path="/puzzles/calibration" element={<CalibrationScreen />} />
          <Route path="/puzzles/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/puzzles/daily" element={<DailyFiveScreen />} />
          <Route path="/puzzles/legends" element={<LegendsHallScreen />} />
          <Route path="/puzzles/master" element={<MasterAtriumScreen />} />
          <Route path="/puzzles/plot/:plot" element={<PlotScreen />} />
          <Route path="/forest" element={<ForestRoute />} />
          <Route path="/wizard" element={<WizardWarningGate><WizardDuelRoute /></WizardWarningGate>} />
          <Route path="/wizard/:roomId" element={<WizardWarningGate><WizardRoomRoute /></WizardWarningGate>} />
          <Route path="/wizard/v2/:roomId" element={<WizardWarningGate><WizardV2Route /></WizardWarningGate>} />
          <Route path="/shop" element={<ShopScreen />} />
          <Route path="/library" element={<LibraryRoute />} />
          <Route path="/knights-hop" element={<KnightsHopRoute />} />
          <Route path="/knights-run" element={<KnightsRunRoute />} />
          <Route path="/endgame" element={<EndgameRoute />} />
          <Route path="/endgame/:id" element={<EndgameLessonScreen />} />
          <Route path="/openings" element={<OpeningsRoute />} />
          <Route path="/openings/:id" element={<OpeningLessonScreen />} />
          <Route path="/tournament" element={<TournamentRoute />} />
          <Route path="/me" element={<AdventurerPlaqueScreen />} />
          <Route path="/team/:teamId" element={<TeamPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </UserCardHost>
        </OutgoingInviteProvider>
        </CurrentChampionProvider>
      </CastleIdentityProvider>
    </BrowserRouter>
  )
}
