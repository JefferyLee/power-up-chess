// LeaderboardScreen — per-plot leaderboards.
//
// Subscribes to all 6 puzzle_leaderboards/{plot} docs written by the
// scheduled refreshPuzzleLeaderboards function. Tab strip across the
// top — one tab per plot. Within a tab: two columns, All-time tops and
// This week's climbers. The current visitor's row is highlighted if
// they appear.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/app'
import { useCastle } from '../castle/useCastle'
import type { Plot } from '../firebase/callables'
import './LeaderboardScreen.css'

interface LeaderboardEntry {
  displayName: string
  rating: number
  gain?: number
}
interface LeaderboardDoc {
  plot: Plot
  topAllTime: LeaderboardEntry[]
  topClimbers: LeaderboardEntry[]
  weekKey: string
  refreshedAt: number
}

const PLOT_LABELS: Record<Plot, string> = {
  mate: 'Mate Meadow',
  fork: 'Fork Grove',
  pinSkewer: 'Pin & Skewer',
  sacrifice: 'Sacrifice',
  endgame: 'Endgame Pond',
  defense: "Defender's Thicket",
}
const PLOT_ORDER: Plot[] = [
  'mate',
  'fork',
  'pinSkewer',
  'sacrifice',
  'endgame',
  'defense',
]

export function LeaderboardScreen() {
  const navigate = useNavigate()
  const { identity } = useCastle()
  const [boards, setBoards] = useState<Partial<Record<Plot, LeaderboardDoc>>>({})
  const [activePlot, setActivePlot] = useState<Plot>('mate')

  // One snapshot listener per plot doc. Cheap: 6 small docs.
  useEffect(() => {
    const unsubs = PLOT_ORDER.map((plot) =>
      onSnapshot(doc(db, 'puzzle_leaderboards', plot), (snap) => {
        const data = snap.data() as LeaderboardDoc | undefined
        if (!data) return
        setBoards((prev) => ({ ...prev, [plot]: data }))
      }),
    )
    return () => {
      for (const u of unsubs) u()
    }
  }, [])

  const activeBoard = boards[activePlot]
  const myName = identity?.displayName ?? ''
  // Recomputed every render — only used as a display string, no perf cost.
  const refreshedAgo = activeBoard ? formatAgo(activeBoard.refreshedAt) : ''

  return (
    <div className="puc-lb">
      <header className="puc-lb__header">
        <button
          type="button"
          className="puc-lb__back"
          onClick={() => navigate('/puzzles')}
          aria-label="Back to garden"
        >
          ←
        </button>
        <h1 className="puc-lb__title">Trophies</h1>
      </header>

      <div className="puc-lb__tabs" role="tablist">
        {PLOT_ORDER.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === activePlot}
            className={
              'puc-lb__tab ' + (p === activePlot ? 'puc-lb__tab--active' : '')
            }
            onClick={() => setActivePlot(p)}
          >
            {PLOT_LABELS[p]}
          </button>
        ))}
      </div>

      {!activeBoard && (
        <p className="puc-lb__empty">
          The trophies for {PLOT_LABELS[activePlot]} are still warming up — the
          leaderboards refresh every few minutes.
        </p>
      )}

      {activeBoard && (
        <>
          <p className="puc-lb__meta">
            Week {activeBoard.weekKey} · updated {refreshedAgo}
          </p>
          <div className="puc-lb__cols">
            <BoardColumn
              title="All-time tops"
              entries={activeBoard.topAllTime}
              myName={myName}
              metric="rating"
            />
            <BoardColumn
              title="This week's climbers"
              entries={activeBoard.topClimbers}
              myName={myName}
              metric="gain"
              emptyText="No climbers yet this week — be the first."
            />
          </div>
        </>
      )}
    </div>
  )
}

function formatAgo(epochMs: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - epochMs) / 60_000))
  if (mins === 0) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

function BoardColumn({
  title,
  entries,
  myName,
  metric,
  emptyText,
}: {
  title: string
  entries: LeaderboardEntry[]
  myName: string
  metric: 'rating' | 'gain'
  emptyText?: string
}) {
  return (
    <section className="puc-lb__col">
      <h2 className="puc-lb__col-title">{title}</h2>
      {entries.length === 0 ? (
        <p className="puc-lb__col-empty">{emptyText ?? 'Nothing yet.'}</p>
      ) : (
        <ol className="puc-lb__list">
          {entries.map((e, i) => {
            const isMe =
              myName.length > 0 &&
              e.displayName.toLowerCase() === myName.toLowerCase()
            return (
              <li
                key={`${e.displayName}-${i}`}
                className={'puc-lb__row ' + (isMe ? 'puc-lb__row--me' : '')}
              >
                <span className="puc-lb__rank">#{i + 1}</span>
                <span className="puc-lb__name">{e.displayName}</span>
                <span className="puc-lb__metric">
                  {metric === 'rating'
                    ? e.rating
                    : e.gain !== undefined
                      ? `+${e.gain}`
                      : ''}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
