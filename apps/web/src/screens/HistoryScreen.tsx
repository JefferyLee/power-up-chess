import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearAllGames, listGames } from '../history/api'
import { callGetPlayerGames } from '../firebase/callables'
import { useCastle } from '../castle/useCastle'
import type { SavedGame } from '../history/db'
import { HOSTS } from '../hosts/hosts'
import type { EndReason } from '../rooms/types'
import './HistoryScreen.css'

import { friendlyError } from '../errors/friendlyError'
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; games: SavedGame[] }
  | { kind: 'error'; error: string }

export function HistoryScreen() {
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [confirmClear, setConfirmClear] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const { identity } = useCastle()
  useEffect(() => {
    let cancelled = false
    // Phase 3.4 — merge this device's IndexedDB games with the account's
    // synced archive, so a fresh device still shows "my games". Local rows
    // win on id collisions; cloud-only rows get a ☁️ badge.
    const cloudPromise: Promise<SavedGame[]> = identity && !identity.isBypass
      ? callGetPlayerGames(identity.normalizedName, 50)
          .then((res) => res.games
            .filter((g) => (g.mode === 'local' || g.mode === 'ai') && typeof g.pgn === 'string')
            .map((g): SavedGame & { remote: boolean } => ({
              id: g.roomId,
              playedAt: g.playedAt,
              mode: g.mode!,
              whiteName: g.whiteName,
              blackName: g.blackName,
              hostId: g.hostId,
              result: g.result,
              endReason: g.endReason,
              pgn: g.pgn!,
              finalFen: '',
              moveCount: g.moveCount,
              ...(g.aiDifficulty ? { aiDifficulty: g.aiDifficulty } : {}),
              remote: true,
            })))
          .catch(() => [])
      : Promise.resolve([])
    Promise.all([listGames(), cloudPromise])
      .then(([local, cloud]) => {
        if (cancelled) return
        const seen = new Set(local.map((g) => g.id))
        const merged = [...local, ...cloud.filter((g) => !seen.has(g.id))]
          .sort((a, b) => b.playedAt - a.playedAt)
        setState({ kind: 'ready', games: merged })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ kind: 'error', error: friendlyError(err, 'loading your games') })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTick, identity?.normalizedName])

  const handleClear = async () => {
    await clearAllGames()
    setConfirmClear(false)
    setReloadTick((n) => n + 1)
  }

  return (
    <div className="puc-history">
      <header className="puc-history__header">
        <button
          type="button"
          className="puc-history__back"
          onClick={() => navigate('/')}
          aria-label="Back to menu"
        >
          ←
        </button>
        <h1 className="puc-history__title">Match history</h1>
        {state.kind === 'ready' && state.games.length > 0 && (
          <button
            type="button"
            className="puc-history__danger"
            onClick={() => setConfirmClear(true)}
          >
            Forget all data
          </button>
        )}
      </header>

      <main className="puc-history__main">
        {state.kind === 'loading' && <p className="puc-history__empty">Loading your games…</p>}
        {state.kind === 'error' && <p className="puc-history__empty">Couldn't load history: {state.error}</p>}
        {state.kind === 'ready' && state.games.length === 0 && (
          <p className="puc-history__empty">No saved games yet. Play one and it will appear here.</p>
        )}
        {state.kind === 'ready' && state.games.length > 0 && (
          <ul className="puc-history__list">
            {state.games.map((g) => (
              <HistoryRow
                key={g.id}
                game={g}
                onReview={() => navigate('/review', {
                  state: {
                    pgn: g.pgn,
                    hostId: g.hostId,
                    whiteName: g.whiteName,
                    blackName: g.blackName,
                    // Online games carry id "online:ROOMID" — pass the
                    // room id so the review can annotate the archive.
                    ...(g.mode === 'online' && g.id.startsWith('online:')
                      ? { roomId: g.id.slice('online:'.length) }
                      : {}),
                  },
                })}
              />
            ))}
          </ul>
        )}
      </main>

      {confirmClear && (
        <div className="puc-history__confirm" role="dialog" aria-modal="true">
          <div className="puc-history__confirm-backdrop" onClick={() => setConfirmClear(false)} />
          <div className="puc-history__confirm-card">
            <h2>Forget all saved games?</h2>
            <p>This will permanently delete every game from this device. There is no undo.</p>
            <div className="puc-history__confirm-actions">
              <button type="button" className="puc-history__btn--ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button type="button" className="puc-history__btn--danger" onClick={handleClear}>
                Forget everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HistoryRow({ game, onReview }: { game: SavedGame; onReview: () => void }) {
  const host = HOSTS[game.hostId]
  const winnerName =
    game.result === 'draw'
      ? null
      : game.result === 'white'
        ? game.whiteName
        : game.blackName

  return (
    <li className="puc-history__row">
      <button type="button" className="puc-history__row-btn" onClick={onReview}>
        <div className="puc-history__row-main">
          <div className="puc-history__row-players">
            <span className="puc-history__name">{game.whiteName}</span>
            <span className="puc-history__vs">vs</span>
            <span className="puc-history__name">{game.blackName}</span>
          </div>
          <div className="puc-history__row-meta">
            <span className="puc-history__date">{formatDate(game.playedAt)}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__mode">{modeLabel(game)}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__host">Host: {host.name}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__moves">{game.moveCount} moves</span>
          </div>
        </div>
        <div className="puc-history__row-result">
          <ResultBadge result={game.result} winnerName={winnerName} reason={game.endReason} />
        </div>
      </button>
    </li>
  )
}

function ResultBadge({
  result,
  winnerName,
  reason,
}: {
  result: 'white' | 'black' | 'draw'
  winnerName: string | null
  reason: EndReason
}) {
  if (result === 'draw') {
    return (
      <div className="puc-history__badge puc-history__badge--draw">
        <span className="puc-history__badge-result">Draw</span>
        <span className="puc-history__badge-reason">{prettyReason(reason)}</span>
      </div>
    )
  }
  return (
    <div className="puc-history__badge puc-history__badge--win">
      <span className="puc-history__badge-result">{winnerName} won</span>
      <span className="puc-history__badge-reason">{prettyReason(reason)}</span>
    </div>
  )
}

function modeLabel(g: SavedGame): string {
  if (g.mode === 'online') return 'Online'
  if (g.mode === 'ai') {
    const tier = g.aiDifficulty ? ` · ${g.aiDifficulty.charAt(0).toUpperCase()}${g.aiDifficulty.slice(1)}` : ''
    return `AI${tier}`
  }
  return 'Local'
}

function prettyReason(r: EndReason): string {
  switch (r) {
    case 'checkmate': return 'by checkmate'
    case 'stalemate': return 'by stalemate'
    case 'resign': return 'by resignation'
    case 'timeout': return 'on time'
    case 'insufficient_material': return 'insufficient material'
    case 'threefold_repetition': return 'threefold repetition'
    case 'fifty_move': return '50-move rule'
    default: return ''
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
