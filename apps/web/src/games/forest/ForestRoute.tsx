// Forest Adventure route — wraps the canvas game in the Hall's themed
// header chrome and a leaderboard side-panel. Persists each finished run
// to local IDB + (non-bypass) Firestore via submitForestScore.

import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useCastle } from '../../castle/useCastle'
import { ForestGame } from './ForestGame'
import { ForestLeaderboard } from './ForestLeaderboard'
import { saveForestRun } from './history'
import { callSubmitForestScore } from '../../firebase/callables'
import './ForestRoute.css'

import { friendlyError } from '../../errors/friendlyError'
export function ForestRoute() {
  const navigate = useNavigate()
  const { identity, setCastlePoints } = useCastle()
  const [leaderboardKey, setLeaderboardKey] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [payoutToast, setPayoutToast] = useState<{ id: number; pts: number; capped: boolean } | null>(null)

  // Auto-dismiss the payout toast after ~5 s.
  useEffect(() => {
    if (!payoutToast) return
    const t = window.setTimeout(() => setPayoutToast(null), 5000)
    return () => window.clearTimeout(t)
  }, [payoutToast])

  const handleExit = useCallback(() => navigate('/'), [navigate])

  const handleRunComplete = useCallback(
    async (finalScore: number) => {
      if (!identity) return
      const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      // Local IDB always, even for bypass guests.
      await saveForestRun({
        runId,
        displayName: identity.displayName,
        score: finalScore,
        finishedAt: Date.now(),
      })
      // Firestore + global leaderboard only for non-bypass guests.
      if (!identity.isBypass) {
        try {
          const res = await callSubmitForestScore({
            normalizedName: identity.normalizedName,
            runId,
            score: finalScore,
          })
          if (res.castlePointsAdded > 0) {
            setCastlePoints(res.castlePoints)
            // "capped" = the tier would have paid more but the day's cap clipped it.
            // We can't tell precisely without re-doing the tier math, so we just
            // surface the awarded number; the user sees "+N castle points".
            setPayoutToast({ id: Date.now(), pts: res.castlePointsAdded, capped: false })
          }
        } catch (err) {
          setLastError(friendlyError(err, 'banking your forest run'))
        }
      }
      // Bump the leaderboard refresh key so the panel re-fetches.
      setLeaderboardKey((k) => k + 1)
    },
    [identity, setCastlePoints],
  )

  if (!identity) return <Navigate to="/" replace />

  return (
    <div className="puc-forest-route">
      <header className="puc-forest-route__header">
        <button type="button" className="puc-forest-route__back" onClick={handleExit}>
          ← Back to the Hall
        </button>
        <h1 className="puc-forest-route__title">Forest Adventure</h1>
        <span className="puc-forest-route__player">Playing as {identity.displayName}</span>
      </header>

      <main className="puc-forest-route__main">
        <div className="puc-forest-route__game">
          <ForestGame
            playerName={identity.displayName}
            onExit={handleExit}
            onRunComplete={(s) => { void handleRunComplete(s) }}
          />
          {lastError && (
            <p className="puc-forest-route__error">
              Couldn&apos;t save score to the leaderboard: {lastError}
            </p>
          )}
          {payoutToast && (
            <div key={payoutToast.id} className="puc-forest-route__payout" role="status">
              <span className="puc-forest-route__payout-icon" aria-hidden="true">🏰</span>
              <span className="puc-forest-route__payout-body">
                <b>+{payoutToast.pts}</b> castle points
                {payoutToast.capped && <span className="puc-forest-route__payout-cap"> (daily cap)</span>}
              </span>
            </div>
          )}
        </div>
        <aside className="puc-forest-route__leaderboard">
          <ForestLeaderboard refreshKey={leaderboardKey} youNormalizedName={identity.normalizedName} />
        </aside>
      </main>
    </div>
  )
}
