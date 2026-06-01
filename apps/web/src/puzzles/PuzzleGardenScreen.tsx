import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { ALL_PUZZLES, sortByDifficulty } from './loader'
import type { Puzzle, PuzzleMotif } from './types'
import { bestAttempts } from '../history/api'
import type { PuzzleAttempt } from '../history/db'
import './PuzzleGardenScreen.css'

const MOTIF_GROUPS: Array<{ label: string; matches: (m: PuzzleMotif) => boolean }> = [
  { label: 'Mate in 1', matches: (m) => m === 'mateIn1' },
  { label: 'Mate in 2', matches: (m) => m === 'mateIn2' },
  { label: 'Forks', matches: (m) => m === 'fork' },
  { label: 'Pins', matches: (m) => m === 'pin' || m === 'absolutePin' },
  { label: 'Skewers', matches: (m) => m === 'skewer' },
  { label: 'Hanging pieces', matches: (m) => m === 'hangingPiece' },
  { label: 'Discovered attacks', matches: (m) => m === 'discoveredAttack' },
]

function primaryGroupLabel(p: Puzzle): string {
  for (const g of MOTIF_GROUPS) {
    if (p.motifs.some(g.matches)) return g.label
  }
  return 'Other'
}

interface GardenRow {
  puzzle: Puzzle
  best: PuzzleAttempt | null
}

export function PuzzleGardenScreen() {
  const navigate = useNavigate()
  const [bestMap, setBestMap] = useState<Map<string, PuzzleAttempt> | null>(null)

  useEffect(() => {
    let cancelled = false
    bestAttempts().then((m) => {
      if (!cancelled) setBestMap(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Group puzzles by primary motif. Sort within group by difficulty asc.
  const groups = useMemo(() => {
    const byLabel = new Map<string, GardenRow[]>()
    for (const p of sortByDifficulty(ALL_PUZZLES)) {
      const label = primaryGroupLabel(p)
      const list = byLabel.get(label) ?? []
      list.push({ puzzle: p, best: bestMap?.get(p.id) ?? null })
      byLabel.set(label, list)
    }
    // Preserve MOTIF_GROUPS order, then any unknown groups (like Other) last.
    const ordered: Array<{ label: string; rows: GardenRow[] }> = []
    for (const g of MOTIF_GROUPS) {
      const rows = byLabel.get(g.label)
      if (rows && rows.length > 0) {
        ordered.push({ label: g.label, rows })
        byLabel.delete(g.label)
      }
    }
    for (const [label, rows] of byLabel) {
      ordered.push({ label, rows })
    }
    return ordered
  }, [bestMap])

  const totalPoints = useMemo(() => {
    if (!bestMap) return 0
    let t = 0
    for (const a of bestMap.values()) t += a.points
    return t
  }, [bestMap])

  // "Next unsolved" picks the easiest puzzle that hasn't been three-starred.
  // If everything is 3-starred, return the easiest one anyway so the button
  // always works (replay is fine).
  const nextTarget = useMemo<Puzzle | null>(() => {
    if (!bestMap) return null
    for (const g of groups) {
      for (const row of g.rows) {
        const stars = row.best?.stars ?? 0
        if (stars < 3) return row.puzzle
      }
    }
    return groups[0]?.rows[0]?.puzzle ?? null
  }, [groups, bestMap])

  return (
    <div className="puc-garden">
      <header className="puc-garden__header">
        <button
          type="button"
          className="puc-garden__back"
          onClick={() => navigate('/')}
          aria-label="Back to menu"
        >
          ←
        </button>
        <h1 className="puc-garden__title">Puzzle Garden</h1>
        <div className="puc-garden__total">
          <span className="puc-garden__total-label">Total points</span>
          <span className="puc-garden__total-value">{totalPoints}</span>
        </div>
      </header>

      <main className="puc-garden__main">
        {nextTarget && (
          <button
            type="button"
            className="puc-garden__next"
            onClick={() => navigate(`/puzzles/${nextTarget.id}`)}
          >
            <span className="puc-garden__next-label">Next unsolved</span>
            <span className="puc-garden__next-detail">
              {primaryGroupLabel(nextTarget)} · rating {nextTarget.difficulty}
            </span>
          </button>
        )}

        {bestMap === null && (
          <p className="puc-garden__empty">Loading your progress…</p>
        )}

        {bestMap !== null && groups.map((g) => (
          <section key={g.label} className="puc-garden__group">
            <h2 className="puc-garden__group-title">{g.label}</h2>
            <ul className="puc-garden__list">
              {g.rows.map((row, idx) => (
                <PuzzleRow
                  key={row.puzzle.id}
                  index={idx + 1}
                  row={row}
                  onClick={() => navigate(`/puzzles/${row.puzzle.id}`)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  )
}

function PuzzleRow({
  index,
  row,
  onClick,
}: {
  index: number
  row: GardenRow
  onClick: () => void
}) {
  const stars = row.best?.stars ?? 0
  const points = row.best?.points ?? 0
  const attempted = row.best !== null
  return (
    <li>
      <button
        type="button"
        className={clsx(
          'puc-garden__row',
          attempted && 'puc-garden__row--attempted',
          stars === 3 && 'puc-garden__row--perfect',
        )}
        onClick={onClick}
      >
        <span className="puc-garden__row-num">#{index}</span>
        <span className="puc-garden__row-stars" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map((i) => (
            <MiniStar key={i} filled={i <= stars} />
          ))}
        </span>
        <span className="puc-garden__row-difficulty">rating {row.puzzle.difficulty}</span>
        <span className="puc-garden__row-points">
          {attempted ? `${points} pts` : 'unattempted'}
        </span>
      </button>
    </li>
  )
}

function MiniStar({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      className={clsx('puc-garden__star', filled && 'puc-garden__star--on')}
      aria-hidden="true"
    >
      <path
        d="M12 2.5 14.8 9 22 9.8l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.4L2 9.8 9.2 9z"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  )
}
