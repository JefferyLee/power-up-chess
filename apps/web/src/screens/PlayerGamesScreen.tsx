// PlayerGamesScreen — another player's finished ONLINE games, read
// from the server-side per-player archive (guests/{name}/games). Tap a
// game to review it; reviewing someone else's game never awards crowns
// or castle points (the /review screen is told award:false).
//
// Reached from the plaque's "Match history" link for non-self players.
// The viewer's OWN history (incl. local + AI) stays on /history,
// sourced from local IndexedDB.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  callGetPlayerGames,
  callGetRoomGame,
  type ArchivedGameSummary,
} from '../firebase/callables'
import { HOSTS } from '../hosts/hosts'
import type { EndReason } from '../rooms/types'
import './HistoryScreen.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; games: ArchivedGameSummary[] }
  | { kind: 'error'; error: string }

export function PlayerGamesScreen() {
  const navigate = useNavigate()
  const { name } = useParams<{ name: string }>()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [openingId, setOpeningId] = useState<string | null>(null)

  useEffect(() => {
    if (!name) {
      setState({ kind: 'error', error: 'No player.' })
      return
    }
    let cancelled = false
    callGetPlayerGames(name)
      .then((res) => { if (!cancelled) setState({ kind: 'ready', games: res.games }) })
      .catch((err) => {
        if (cancelled) return
        setState({ kind: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => { cancelled = true }
  }, [name])

  const review = async (roomId: string) => {
    if (openingId) return
    setOpeningId(roomId)
    try {
      const res = await callGetRoomGame(roomId)
      if (!res.ok) {
        setOpeningId(null)
        return
      }
      navigate('/review', {
        state: {
          pgn: res.pgn,
          hostId: res.hostId,
          whiteName: res.whiteName,
          blackName: res.blackName,
          // Viewing someone else's game — no crowns / castle points.
          award: false,
        },
      })
    } catch {
      setOpeningId(null)
    }
  }

  return (
    <div className="puc-history">
      <header className="puc-history__header">
        <button
          type="button"
          className="puc-history__back"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="puc-history__title">{name}&apos;s online games</h1>
      </header>

      <main className="puc-history__main">
        {state.kind === 'loading' && <p className="puc-history__empty">Loading games…</p>}
        {state.kind === 'error' && <p className="puc-history__empty">Couldn&apos;t load games: {state.error}</p>}
        {state.kind === 'ready' && state.games.length === 0 && (
          <p className="puc-history__empty">No online games yet.</p>
        )}
        {state.kind === 'ready' && state.games.length > 0 && (
          <ul className="puc-history__list">
            {state.games.map((g) => (
              <GameRow
                key={g.roomId}
                game={g}
                opening={openingId === g.roomId}
                onReview={() => { void review(g.roomId) }}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function GameRow({
  game,
  opening,
  onReview,
}: {
  game: ArchivedGameSummary
  opening: boolean
  onReview: () => void
}) {
  const host = HOSTS[game.hostId]
  const winnerName =
    game.result === 'draw' ? null : game.result === 'white' ? game.whiteName : game.blackName
  return (
    <li className="puc-history__row">
      <button type="button" className="puc-history__row-btn" onClick={onReview} disabled={opening}>
        <div className="puc-history__row-main">
          <div className="puc-history__row-players">
            <span className="puc-history__name">{game.whiteName}</span>
            <span className="puc-history__vs">vs</span>
            <span className="puc-history__name">{game.blackName}</span>
          </div>
          <div className="puc-history__row-meta">
            <span className="puc-history__date">{formatDate(game.playedAt)}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__mode">Online</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__host">Host: {host.name}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__moves">{game.moveCount} moves</span>
          </div>
        </div>
        <div className="puc-history__row-result">
          {opening ? (
            <div className="puc-history__badge">
              <span className="puc-history__badge-result">Opening…</span>
            </div>
          ) : game.result === 'draw' ? (
            <div className="puc-history__badge puc-history__badge--draw">
              <span className="puc-history__badge-result">Draw</span>
              <span className="puc-history__badge-reason">{prettyReason(game.endReason)}</span>
            </div>
          ) : (
            <div className="puc-history__badge puc-history__badge--win">
              <span className="puc-history__badge-result">{winnerName} won</span>
              <span className="puc-history__badge-reason">{prettyReason(game.endReason)}</span>
            </div>
          )}
        </div>
      </button>
    </li>
  )
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
  if (d.toDateString() === now.toDateString()) {
    return `Today ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
