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
  archiveRole,
  callBrowseGames,
  callDeleteArchivedGame,
  callFeatureGame,
  callGetRoomGame,
  type BrowseSort,
  type GlobalGameSummary,
} from '../firebase/callables'
import { useCastle } from '../castle/useCastle'
import { HOSTS } from '../hosts/hosts'
import type { EndReason } from '../rooms/types'
import { MastersView } from './MastersView'
import './HistoryScreen.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; games: GlobalGameSummary[]; cursor: number | null; more: boolean }
  | { kind: 'error'; error: string }

const SORTS: Array<{ key: BrowseSort; label: string }> = [
  { key: 'recent', label: 'Recent' },
  { key: 'featured', label: '★ Featured' },
  { key: 'cleanest', label: 'Cleanest' },
  { key: 'brilliant', label: 'Most brilliant' },
]

export function GameArchiveScreen() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const role = archiveRole(identity?.normalizedName)
  const [sort, setSort] = useState<BrowseSort>('recent')
  // Masters mode swaps the whole online list for the static GM archive.
  const [masters, setMasters] = useState(false)
  // Player filter (overrides sort). Draft = the input; player = applied.
  const [draft, setDraft] = useState('')
  const [player, setPlayer] = useState<string | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    seen.current = new Set()
    setState({ kind: 'loading' })
    callBrowseGames(player ? { player } : { sort })
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
  }, [sort, player])

  // Patch one game in place (after feature toggle) or drop it (delete).
  const patchGame = useCallback((roomId: string, change: Partial<GlobalGameSummary> | null) => {
    setState((s) => {
      if (s.kind !== 'ready') return s
      const games = change === null
        ? s.games.filter((g) => g.roomId !== roomId)
        : s.games.map((g) => (g.roomId === roomId ? { ...g, ...change } : g))
      return { ...s, games }
    })
  }, [])

  const onFeature = useCallback(async (roomId: string, next: boolean) => {
    try {
      const featured = await callFeatureGame(roomId, next)
      // In the Featured view, un-featuring removes the row.
      if (!featured && sort === 'featured' && !player) patchGame(roomId, null)
      else patchGame(roomId, { featured })
    } catch { /* ignore — leave the row as-is */ }
  }, [sort, player, patchGame])

  const onDelete = useCallback(async (roomId: string) => {
    try {
      if (await callDeleteArchivedGame(roomId)) patchGame(roomId, null)
    } catch { /* ignore */ }
  }, [patchGame])

  const loadMore = useCallback(async () => {
    if (state.kind !== 'ready' || state.cursor === null || loadingMore || player) return
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
  }, [state, loadingMore, sort, player])

  const applyFilter = () => {
    const v = draft.trim().toLowerCase()
    setPlayer(v || null)
  }
  const clearFilter = () => { setDraft(''); setPlayer(null) }

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

      <div className="puc-history__tiers" role="tablist" aria-label="Archive section">
        <button
          type="button"
          role="tab"
          aria-selected={!masters}
          className={'puc-history__tier' + (!masters ? ' puc-history__tier--on' : '')}
          onClick={() => setMasters(false)}
        >
          <span className="puc-history__tier-title">🏰 Castle Games</span>
          <span className="puc-history__tier-sub">Games played here in the Castle</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={masters}
          className={'puc-history__tier' + (masters ? ' puc-history__tier--on' : '')}
          onClick={() => setMasters(true)}
        >
          <span className="puc-history__tier-title">♛ Masters</span>
          <span className="puc-history__tier-sub">Famous classics &amp; grandmaster games</span>
        </button>
      </div>

      {!masters && (
        <div className="puc-history__toolbar">
          <div className="puc-history__tabs" role="tablist" aria-label="Sort games">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={!player && sort === s.key}
                className={'puc-history__tab' + (!player && sort === s.key ? ' puc-history__tab--on' : '')}
                onClick={() => { clearFilter(); setSort(s.key) }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="puc-history__filter">
            {player ? (
              <button type="button" className="puc-history__filter-chip" onClick={clearFilter}>
                Player: <b>{player}</b> ✕
              </button>
            ) : (
              <>
                <input
                  className="puc-history__filter-input"
                  placeholder="Filter by player…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyFilter() }}
                />
                <button type="button" className="puc-history__filter-go" onClick={applyFilter}>
                  Find
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <main className="puc-history__main">
        {masters && <MastersView />}
        {!masters && state.kind === 'loading' && <p className="puc-history__empty">Opening the archive…</p>}
        {!masters && state.kind === 'error' && <p className="puc-history__empty">Couldn&apos;t load the archive: {state.error}</p>}
        {!masters && state.kind === 'ready' && state.games.length === 0 && (
          <p className="puc-history__empty">
            {player
              ? `No archived online games for "${player}".`
              : sort === 'recent'
                ? 'No games in the archive yet. Play an online game and it will appear here.'
                : sort === 'featured'
                  ? 'No featured games yet.'
                  : 'No reviewed games yet — open a game and review it, then it ranks here.'}
          </p>
        )}
        {!masters && state.kind === 'ready' && state.games.length > 0 && (
          <>
            <ul className="puc-history__list">
              {state.games.map((g) => (
                <ArchiveRow
                  key={g.roomId}
                  game={g}
                  opening={openingId === g.roomId}
                  role={role}
                  onReview={() => { void review(g.roomId) }}
                  onFilterPlayer={(name) => { setDraft(name); setPlayer(name) }}
                  onFeature={(next) => { void onFeature(g.roomId, next) }}
                  onDelete={() => { void onDelete(g.roomId) }}
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
  role,
  onReview,
  onFilterPlayer,
  onFeature,
  onDelete,
}: {
  game: GlobalGameSummary
  opening: boolean
  role: { curator: boolean; admin: boolean }
  onReview: () => void
  onFilterPlayer: (normalizedName: string) => void
  onFeature: (next: boolean) => void
  onDelete: () => void
}) {
  const host = HOSTS[game.hostId]
  const [recapOpen, setRecapOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const recapHost = game.recap ? HOSTS[game.recap.host] : null
  const winnerName =
    game.result === 'draw' ? null : game.result === 'white' ? game.whiteName : game.blackName
  return (
    <li className={'puc-history__row' + (game.featured ? ' puc-history__row--featured' : '')}>
      <button type="button" className="puc-history__row-btn" onClick={onReview} disabled={opening}>
        <div className="puc-history__row-main">
          <div className="puc-history__row-players">
            {game.featured && <span className="puc-history__star" title="Featured by a coach">★</span>}
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
      <div className="puc-history__rowtools">
        {game.recap && recapHost && (
          <button
            type="button"
            className="puc-history__recap-toggle"
            aria-expanded={recapOpen}
            onClick={() => setRecapOpen((v) => !v)}
          >
            📜 {recapHost.name}&apos;s take {recapOpen ? '▾' : '▸'}
          </button>
        )}
        <span className="puc-history__by">
          {[game.whiteName, game.blackName].map((nm) => (
            <button
              key={nm}
              type="button"
              className="puc-history__bylink"
              onClick={() => onFilterPlayer(nm.trim().toLowerCase())}
              title={`See ${nm}'s games`}
            >
              {nm}
            </button>
          ))}
        </span>
        <span className="puc-history__spacer" />
        {role.curator && (
          <button
            type="button"
            className={'puc-history__curate' + (game.featured ? ' puc-history__curate--on' : '')}
            onClick={() => onFeature(!game.featured)}
            title={game.featured ? 'Remove from Featured' : 'Feature this game'}
          >
            {game.featured ? '★ Featured' : '☆ Feature'}
          </button>
        )}
        {role.admin && (
          confirmDelete ? (
            <span className="puc-history__confirm-inline">
              Delete?
              <button type="button" className="puc-history__curate puc-history__curate--danger" onClick={onDelete}>Yes</button>
              <button type="button" className="puc-history__curate" onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          ) : (
            <button
              type="button"
              className="puc-history__curate"
              onClick={() => setConfirmDelete(true)}
              title="Delete from the archive"
            >
              🗑
            </button>
          )
        )}
      </div>
      {recapOpen && game.recap && (
        <p className="puc-history__recap-text">{game.recap.text}</p>
      )}
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
