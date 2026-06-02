import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LocalGameRoute } from './screens/LocalGameRoute'
import { OnlineGameScreen } from './screens/OnlineGameScreen'
import { PostGameAnalysisScreen } from './screens/PostGameAnalysisScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { PuzzleScreen } from './puzzles/PuzzleScreen'
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
import { CastleEntry } from './castle/CastleEntry'
import { ForestRoute } from './games/forest/ForestRoute'
import { WizardDuelRoute, WizardRoomRoute } from './games/wizard/WizardDuelRoute'
import { ShopScreen } from './cosmetics/ShopScreen'
import { usePresenceHeartbeat } from './castle/usePresenceHeartbeat'
import { useRouteLocation } from './castle/useRouteLocation'

/** Single source of truth for presence — runs at the App root so every
 *  authenticated route auto-publishes a location to lobby/presence
 *  without each screen wiring its own heartbeat. */
function GlobalPresenceHeartbeat() {
  const location = useRouteLocation()
  usePresenceHeartbeat(location)
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <CastleIdentityProvider>
        <GlobalPresenceHeartbeat />
        <Routes>
          <Route path="/" element={<CastleEntry />} />
          <Route path="/local" element={<LocalGameRoute />} />
          <Route path="/ai" element={<AiPracticeRoute />} />
          <Route path="/r/:roomId" element={<OnlineGameScreen />} />
          <Route path="/review" element={<PostGameAnalysisScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/learn" element={<LearnRoute />} />
          <Route path="/learn/:lessonId" element={<LessonScreen />} />
          <Route path="/puzzles" element={<PuzzleGardenScreen />} />
          <Route path="/puzzles/calibration" element={<CalibrationScreen />} />
          <Route path="/puzzles/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/puzzles/daily" element={<DailyFiveScreen />} />
          <Route path="/puzzles/legends" element={<LegendsHallScreen />} />
          <Route path="/puzzles/master" element={<MasterAtriumScreen />} />
          <Route path="/puzzles/plot/:plot" element={<PlotScreen />} />
          <Route path="/puzzles/:id" element={<PuzzleScreen />} />
          <Route path="/forest" element={<ForestRoute />} />
          <Route path="/wizard" element={<WizardDuelRoute />} />
          <Route path="/wizard/:roomId" element={<WizardRoomRoute />} />
          <Route path="/shop" element={<ShopScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CastleIdentityProvider>
    </BrowserRouter>
  )
}
