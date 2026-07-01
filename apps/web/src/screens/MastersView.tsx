// MastersView — the "名局 / Masters" tab of the Hall of Games. A static,
// browsable archive of grandmaster games shipped as a public asset
// (apps/web/public/master-games/): a compact index loaded once, with the
// full move text lazy-fetched per shard only when a game is opened.
//
// Two categories:
//   · 经典名局 (classics) — a small hand-curated set with original blurbs.
//   · 大师对局 (masters)  — thousands of GM games, factual metadata only.
//
// The index is interned: player names + event strings live in dictionaries
// and each game row stores integer indices (keeps the payload small for
// tens of thousands of games). Opening any game routes to /review, which
// runs the same engine analysis + host commentary pipeline used for the
// kid's own games (award: false — browsing the masters never grants crowns).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HostId } from '../hosts/hosts'
import type { ReviewState } from './PostGameAnalysisScreen'

interface ClassicEntry {
  id: string
  white: string
  black: string
  event: string
  year: number
  result: string
  eco: string
  plies: number
  hostId: HostId
  blurb: string
  pgn: string
}
/** Interned master row: [id, wIdx, bIdx, evIdx, year, rCode, eco, plies]. */
type MasterRow = [string, number, number, number, number, number, string, number]
interface MasterIndex {
  version: number
  shardSize: number
  players: string[]
  events: string[]
  classics: ClassicEntry[]
  games: MasterRow[]
}

/** Normalised, display-ready game (classic adds blurb/host/pgn). */
interface Game {
  id: string
  white: string
  black: string
  event: string
  year: number
  result: string
  plies: number
  blurb?: string
}

type Category = 'classic' | 'master'
const PAGE = 30
const RESULTS = ['1-0', '0-1', '1/2-1/2']

// Module-level caches so flipping tabs / categories never refetches.
let indexCache: MasterIndex | null = null
let indexPromise: Promise<MasterIndex> | null = null
let classicGames: Game[] = []
let masterGames: Game[] = []
const shardCache = new Map<number, Record<string, string>>()

function loadIndex(): Promise<MasterIndex> {
  if (indexCache) return Promise.resolve(indexCache)
  if (!indexPromise) {
    indexPromise = fetch('/master-games/index.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data: MasterIndex) => {
        classicGames = data.classics.map((c) => ({
          id: c.id, white: c.white, black: c.black, event: c.event,
          year: c.year, result: c.result, plies: c.plies, blurb: c.blurb,
        }))
        masterGames = data.games
          .map((g): Game => ({
            id: g[0], white: data.players[g[1]]!, black: data.players[g[2]]!,
            event: data.events[g[3]]!, year: g[4], result: RESULTS[g[5]] ?? '*', plies: g[7],
          }))
          .sort((a, b) => b.year - a.year) // newest first
        indexCache = data
        return data
      })
      .catch((err) => { indexPromise = null; throw err })
  }
  return indexPromise
}

async function loadMasterPgn(id: string, shardSize: number): Promise<string> {
  const shardNo = Math.floor(parseInt(id, 36) / shardSize)
  let shard = shardCache.get(shardNo)
  if (!shard) {
    const name = String(shardNo).padStart(4, '0') + '.json'
    const res = await fetch(`/master-games/g/${name}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    shard = await res.json() as Record<string, string>
    shardCache.set(shardNo, shard)
  }
  const pgn = shard[id]
  if (!pgn) throw new Error('Game not found in shard.')
  return pgn
}

/** Masters have no stored host — alternate Lucy / Luca for variety. */
function hostForMaster(id: string): HostId {
  return parseInt(id, 36) % 2 === 0 ? 'lucy' : 'luca'
}

function winnerLabel(g: Game): string {
  if (g.result === '1-0') return `${g.white} won`
  if (g.result === '0-1') return `${g.black} won`
  return 'Draw'
}

export function MastersView() {
  const navigate = useNavigate()
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; error: string } | { kind: 'ready' }>({ kind: 'loading' })
  const [category, setCategory] = useState<Category>('classic')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadIndex()
      .then(() => { if (!cancelled) setState({ kind: 'ready' }) })
      .catch((err) => { if (!cancelled) setState({ kind: 'error', error: err instanceof Error ? err.message : String(err) }) })
    return () => { cancelled = true }
  }, [])

  // Reset paging when the category or applied query changes.
  useEffect(() => { setLimit(PAGE) }, [category, query])

  const filtered = useMemo(() => {
    if (state.kind !== 'ready') return [] as Game[]
    const rows = category === 'classic' ? classicGames : masterGames
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((g) =>
      g.white.toLowerCase().includes(q) || g.black.toLowerCase().includes(q) || g.event.toLowerCase().includes(q))
  }, [state.kind, category, query])

  const review = async (g: Game) => {
    if (opening || !indexCache) return
    setOpening(g.id)
    try {
      const classic = indexCache.classics.find((c) => c.id === g.id)
      const payload: ReviewState = classic
        ? { pgn: classic.pgn, hostId: classic.hostId, whiteName: classic.white, blackName: classic.black, award: false, intro: classic.blurb }
        : { pgn: await loadMasterPgn(g.id, indexCache.shardSize), hostId: hostForMaster(g.id), whiteName: g.white, blackName: g.black, award: false }
      navigate('/review', { state: payload })
    } catch {
      setOpening(null)
    }
  }

  const applyFilter = () => setQuery(draft)
  const clearFilter = () => { setDraft(''); setQuery('') }

  return (
    <div className="puc-masters">
      <div className="puc-masters__bar">
        <div className="puc-history__tabs" role="tablist" aria-label="Game category">
          <button
            type="button" role="tab"
            aria-selected={category === 'classic'}
            className={'puc-history__tab' + (category === 'classic' ? ' puc-history__tab--on' : '')}
            onClick={() => setCategory('classic')}
          >
            ✦ Classics
          </button>
          <button
            type="button" role="tab"
            aria-selected={category === 'master'}
            className={'puc-history__tab' + (category === 'master' ? ' puc-history__tab--on' : '')}
            onClick={() => setCategory('master')}
          >
            ♛ Master Games
          </button>
        </div>
        {category === 'master' && (
          <div className="puc-history__filter">
            {query ? (
              <button type="button" className="puc-history__filter-chip" onClick={clearFilter}>
                “{query}” ✕
              </button>
            ) : (
              <>
                <input
                  className="puc-history__filter-input"
                  placeholder="Search player or event…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyFilter() }}
                />
                <button type="button" className="puc-history__filter-go" onClick={applyFilter}>Find</button>
              </>
            )}
          </div>
        )}
      </div>

      {category === 'master' && state.kind === 'ready' && (
        <p className="puc-masters__count">{filtered.length.toLocaleString()} games</p>
      )}

      {state.kind === 'loading' && <p className="puc-history__empty">Opening the masters archive…</p>}
      {state.kind === 'error' && <p className="puc-history__empty">Couldn&apos;t load the archive: {state.error}</p>}
      {state.kind === 'ready' && filtered.length === 0 && (
        <p className="puc-history__empty">No games match “{query}”.</p>
      )}
      {state.kind === 'ready' && filtered.length > 0 && (
        <>
          <ul className="puc-history__list">
            {filtered.slice(0, limit).map((g) => (
              <li key={g.id} className={'puc-history__row' + (g.blurb ? ' puc-history__row--featured' : '')}>
                <button type="button" className="puc-history__row-btn" onClick={() => { void review(g) }} disabled={opening === g.id}>
                  <div className="puc-history__row-main">
                    <div className="puc-history__row-players">
                      {g.blurb && <span className="puc-history__star" title="Classic game">✦</span>}
                      <span className="puc-history__name">{g.white}</span>
                      <span className="puc-history__vs">vs</span>
                      <span className="puc-history__name">{g.black}</span>
                    </div>
                    <div className="puc-history__row-meta">
                      <span className="puc-history__date">{g.event}</span>
                      {g.year > 0 && (
                        <>
                          <span className="puc-history__dot" aria-hidden="true">·</span>
                          <span className="puc-history__moves">{g.year}</span>
                        </>
                      )}
                      <span className="puc-history__dot" aria-hidden="true">·</span>
                      <span className="puc-history__moves">{Math.ceil(g.plies / 2)} moves</span>
                    </div>
                    {g.blurb && <p className="puc-masters__blurb">{g.blurb}</p>}
                  </div>
                  <div className="puc-history__row-result">
                    <div className={'puc-history__badge' + (g.result === '1/2-1/2' ? ' puc-history__badge--draw' : ' puc-history__badge--win')}>
                      <span className="puc-history__badge-result">
                        {opening === g.id ? 'Opening…' : winnerLabel(g)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {limit < filtered.length && (
            <button type="button" className="puc-history__more" onClick={() => setLimit((n) => n + PAGE)}>
              Show more games ({(filtered.length - limit).toLocaleString()} left)
            </button>
          )}
        </>
      )}
    </div>
  )
}
