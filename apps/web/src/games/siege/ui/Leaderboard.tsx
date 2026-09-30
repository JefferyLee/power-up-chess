// Leaderboard — one doc, `siege_leaderboards/global`, published every
// five minutes by refreshSiegeLeaderboards. Display names only; the
// visitor's own row is highlighted by display name (same rule as the
// puzzle trophies).
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase/app'
import { useAuthUid } from '../../../auth/useAuthUid'

interface ScoreEntry {
  displayName: string
  score: number
  wave: number
}
interface StarsEntry {
  displayName: string
  stars: number
}
interface SiegeLeaderboardDoc {
  topEndless: ScoreEntry[]
  topCampaign: StarsEntry[]
  daily: { dateKey: string; top: ScoreEntry[] }
  refreshedAt: number
}

interface Props {
  myName: string
  onBack: () => void
}

export function Leaderboard({ myName, onBack }: Props) {
  const [board, setBoard] = useState<SiegeLeaderboardDoc | null | undefined>(undefined)

  // Wait for anonymous auth — a listener opened before sign-in is denied
  // once and never retried (same fix as the puzzle board).
  const authReady = useAuthUid().status === 'ready'
  useEffect(() => {
    if (!authReady) return
    const unsub = onSnapshot(
      doc(db, 'siege_leaderboards', 'global'),
      (snap) => setBoard((snap.data() as SiegeLeaderboardDoc | undefined) ?? null),
      () => setBoard(null),
    )
    return unsub
  }, [authReady])

  return (
    <div className="puc-siege-menu puc-siege-board">
      <header className="puc-siege-menu__head">
        <button type="button" className="puc-siege-btn puc-siege-btn--icon" onClick={onBack} aria-label="Back to the maps">
          ←
        </button>
        <h1 className="puc-siege-menu__title">Defenders’ Board</h1>
      </header>

      {board === undefined && <p className="puc-siege-menu__note">Fetching the board…</p>}
      {board === null && (
        <p className="puc-siege-menu__note">
          No scores yet — the board fills in a few minutes after the first defender finishes a run.
        </p>
      )}

      {board && (
        <div className="puc-siege-board__cols">
          <Column title="Endless" entries={board.topEndless} myName={myName} metric={(e) => `${e.score} · wave ${e.wave}`} empty="No endless runs yet. Win any map to open Endless." />
          <Column
            title="Campaign stars"
            entries={board.topCampaign}
            myName={myName}
            metric={(e) => `${e.stars} ★`}
            empty="No stars on the board yet. The first defender's name goes here."
          />
          <Column
            title={`Today · ${board.daily.dateKey}`}
            entries={board.daily.top}
            myName={myName}
            metric={(e) => `${e.score} · wave ${e.wave}`}
            empty="Nobody has taken today's challenge yet."
          />
        </div>
      )}
    </div>
  )
}

function Column<T extends { displayName: string }>({
  title,
  entries,
  myName,
  metric,
  empty,
}: {
  title: string
  entries: T[]
  myName: string
  metric: (e: T) => string
  empty: string
}) {
  const me = myName.trim().toLowerCase()
  return (
    <section className="puc-siege-board__col">
      <h2 className="puc-siege-board__col-title">{title}</h2>
      {entries.length === 0 ? (
        <p className="puc-siege-menu__note">{empty}</p>
      ) : (
        <ol className="puc-siege-board__list">
          {entries.map((e, i) => {
            const isMe = me.length > 0 && e.displayName.toLowerCase() === me
            return (
              <li key={`${e.displayName}-${i}`} className={'puc-siege-board__row' + (isMe ? ' puc-siege-board__row--me' : '')}>
                <span className="puc-siege-board__rank">#{i + 1}</span>
                <span className="puc-siege-board__name">{e.displayName}</span>
                <span className="puc-siege-board__metric">{metric(e)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
