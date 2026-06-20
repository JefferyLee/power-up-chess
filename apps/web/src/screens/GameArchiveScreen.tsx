// GameArchiveScreen — the Hall of Games. A global, browsable archive of
// every finished ONLINE game; anyone signed in can open one and review
// it (read-only — reviewing here grants no crowns / castle points).
//
// Phase 1: recent-first, paginated. Phase 2 adds "cleanest" /
// "brilliant" sorts once review-time engine analysis is persisted onto
// each game, plus the host's stored take.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  callBrowseGames,
  callGetRoomGame,
  type BrowseSort,
  type GlobalGameSummary,
} from '../firebase/callables'
import { HOSTS } from '../hosts/hosts'
import type { EndReason } from '../rooms/types'
import './HistoryScreen.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; games: GlobalGameSummary[]; cursor: number | null; more: boolean }
  | { kind: 'error'; error: string }

const SORTS: Array<{ key: BrowseSort; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'cleanest', label: 'Cleanest' },
  { key: 'brilliant', label: 'Most brilliant' },
]

export function GameArchiveScreen() {
  const navigate = useNavigate()
  const [sort, setSort] = useState<BrowseSort>('recent')
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    seen.current = new Set()
    setState({ kind: 'loading' })
    callBrowseGames({ sort })
      .then((res) => {
        if (cancelled) return
        for (const g of res.games) seen.current.add(g.roomId)
        setState({ kind: 'ready', games: res.games, cursor: res.nextCursor, more: res.nextCursor !== null })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ kind: 'error', error: err instanceof Error ? err.message : String(err) })
      })
    return () => { cancelled = true }
  }, [sort])

  const loadMore = useCallback(async () => {
    if (state.kind !== 'ready' || state.cursor === null || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await callBrowseGames({ sort, cursorPlayedAt: state.cursor })
      const fresh = res.games.filter((g) => !seen.current.has(g.roomId))
      for (const g of fresh) seen.current.add(g.roomId)
      setState((s) =>
        s.kind === 'ready'
          ? { kind: 'ready', games: [...s.games, ...fresh], cursor: res.nextCursor, more: res.nextCursor !== null }
          : s,
      )
    } catch {
      /* leave the list as-is; the button stays for a retry */
    } finally {
      setLoadingMore(false)
    }
  }, [state, loadingMore, sort])

  const review = async (roomId: string) => {
    if (openingId) return
    setOpeningId(roomId)
    try {
      const res = await callGetRoomGame(roomId)
      if (!res.ok) { setOpeningId(null); return }
      navigate('/review', {
        state: {
          pgn: res.pgn,
          hostId: res.hostId,
          whiteName: res.whiteName,
          blackName: res.blackName,
          award: false, // public archive — viewing never awards
          roomId, // lets the review upload its analysis to this game
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
          onClick={() => navigate('/')}
          aria-label="Back to hall"
        >
          ←
        </button>
        <h1 className="puc-history__title">Hall of Games</h1>
      </header>

      <div className="puc-history__tabs" role="tablist" aria-label="Sort games">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={sort === s.key}
            className={'puc-history__tab' + (sort === s.key ? ' puc-history__tab--on' : '')}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <main className="puc-history__main">
        {sort !== 'recent' && state.kind === 'ready' && state.games.length === 0 && (
          <p className="puc-history__empty">No reviewed games yet — open a game and review it, then it ranks here.</p>
        )}
        {state.kind === 'loading' && <p className="puc-history__empty">Opening the archive…</p>}
        {state.kind === 'error' && <p className="puc-history__empty">Couldn&apos;t load the archive: {state.error}</p>}
        {sort === 'recent' && state.kind === 'ready' && state.games.length === 0 && (
          <p className="puc-history__empty">No games in the archive yet. Play an online game and it will appear here.</p>
        )}
        {state.kind === 'ready' && state.games.length > 0 && (
          <>
            <ul className="puc-history__list">
              {state.games.map((g) => (
                <ArchiveRow
                  key={g.roomId}
                  game={g}
                  opening={openingId === g.roomId}
                  onReview={() => { void review(g.roomId) }}
                />
              ))}
            </ul>
            {state.more && (
              <button
                type="button"
                className="puc-history__more"
                onClick={() => { void loadMore() }}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show more games'}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ArchiveRow({
  game,
  opening,
  onReview,
}: {
  game: GlobalGameSummary
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
            <span className="puc-history__host">Host: {host.name}</span>
            <span className="puc-history__dot" aria-hidden="true">·</span>
            <span className="puc-history__moves">{game.moveCount} moves</span>
            {game.analysis && (
              <>
                <span className="puc-history__dot" aria-hidden="true">·</span>
                <span className="puc-history__quality">{qualityLabel(game)}</span>
              </>
            )}
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

/** Compact engine-quality chip: brilliancies + flaws, zeros hidden;
 *  a clean game reads "flawless". */
function qualityLabel(g: GlobalGameSummary): string {
  const a = g.analysis!
  const parts: string[] = []
  if (a.brilliancies > 0) parts.push(`✨${a.brilliancies}`)
  if (a.flaws > 0) parts.push(`✗${a.flaws}`)
  return parts.length > 0 ? parts.join(' ') : '✓ flawless'
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
