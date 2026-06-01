import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StartScreen } from './screens/StartScreen'
import { LocalGameRoute } from './screens/LocalGameRoute'
import { OnlineGameScreen } from './screens/OnlineGameScreen'
import { PostGameAnalysisScreen } from './screens/PostGameAnalysisScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { PuzzleScreen } from './puzzles/PuzzleScreen'
import { ALL_PUZZLES } from './puzzles/loader'

export function App() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'magic-forest')
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/local" element={<LocalGameRoute />} />
        <Route path="/r/:roomId" element={<OnlineGameScreen />} />
        <Route path="/review" element={<PostGameAnalysisScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        {/* Puzzles: temporary index redirects to the easiest puzzle.
            Real Garden index lands in Phase 8.7. */}
        <Route
          path="/puzzles"
          element={<Navigate to={`/puzzles/${ALL_PUZZLES[0]!.id}`} replace />}
        />
        <Route path="/puzzles/:id" element={<PuzzleScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
