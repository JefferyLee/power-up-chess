import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LocalGameRoute } from './screens/LocalGameRoute'
import { OnlineGameScreen } from './screens/OnlineGameScreen'
import { PostGameAnalysisScreen } from './screens/PostGameAnalysisScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { PuzzleScreen } from './puzzles/PuzzleScreen'
import { PuzzleGardenScreen } from './puzzles/PuzzleGardenScreen'
import { AiPracticeRoute } from './screens/AiPracticeRoute'
import { CastleIdentityProvider } from './castle/CastleIdentityContext'
import { CastleEntry } from './castle/CastleEntry'
import { ForestRoute } from './games/forest/ForestRoute'

export function App() {
  return (
    <BrowserRouter>
      <CastleIdentityProvider>
        <Routes>
          <Route path="/" element={<CastleEntry />} />
          <Route path="/local" element={<LocalGameRoute />} />
          <Route path="/ai" element={<AiPracticeRoute />} />
          <Route path="/r/:roomId" element={<OnlineGameScreen />} />
          <Route path="/review" element={<PostGameAnalysisScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/puzzles" element={<PuzzleGardenScreen />} />
          <Route path="/puzzles/:id" element={<PuzzleScreen />} />
          <Route path="/forest" element={<ForestRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CastleIdentityProvider>
    </BrowserRouter>
  )
}
