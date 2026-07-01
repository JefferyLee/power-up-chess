import { useState } from 'react'
import type { Color, GameStatus } from '../chess/types'
import type { HostId } from '../hosts/hosts'
import { BrilliantWinCeremony } from './BrilliantWinCeremony'
import './GameEndOverlay.css'

const FIRST_WIN_KEY = 'puc:first-win-done'

/** The grand crown ceremony is reserved for milestones, not every win.
 *  Returns true once — the very first win ever — then false forever. */
function consumeFirstWinMilestone(): boolean {
  try {
    if (localStorage.getItem(FIRST_WIN_KEY) === '1') return false
    localStorage.setItem(FIRST_WIN_KEY, '1')
    return true
  } catch {
    return false
  }
}

interface Props {
  status: GameStatus
  whiteName: string
  blackName: string
  hostRecap: string
  hostId: HostId
  /** When set, marks the colour that the LOCAL VIEWER plays as. If the viewer
   *  wins, they get the full Brilliant ceremony. Local 2-player games leave
   *  this undefined — both colours are at the same screen, so any win shows
   *  the ceremony. */
  viewerColor?: Color
  /** Force the grand crown ceremony for a milestone win (e.g. a tournament).
   *  When omitted, only the player's first win ever is grand. */
  grand?: boolean
  onNewGame: () => void
  onBackToMenu: () => void
  onReview?: () => void
}

const FIREWORK_COUNT = 12

export function GameEndOverlay({
  status,
  whiteName,
  blackName,
  hostRecap,
  hostId,
  viewerColor,
  grand,
  onNewGame,
  onBackToMenu,
  onReview,
}: Props) {
  const winColor = status.kind === 'in_progress' ? null : winnerColor(status)
  const isWin = winColor !== null
  // "viewer is the winner" — true in local 2P for any win, or in
  // AI/online when viewerColor matches the winning side.
  const viewerWon = isWin && (viewerColor === undefined || viewerColor === winColor)
  // The grand crown ceremony is a milestone moment — the player's first win
  // ever, or a caller-forced milestone — not every game. Ordinary wins still
  // get a warm celebration (fireworks + recap) via the lighter card below.
  const [isGrand] = useState(() => viewerWon && (grand === true || consumeFirstWinMilestone()))

  if (status.kind === 'in_progress') return null

  const headline = headlineFor(status, whiteName, blackName)
  const winnerName = winColor === 'w' ? whiteName : winColor === 'b' ? blackName : ''

  return (
    <div className="puc-end" role="dialog" aria-modal="true" aria-labelledby="puc-end-headline">
      <div className="puc-end__backdrop" />

      {viewerWon && (
        <div className="puc-end__fireworks" aria-hidden="true">
          {Array.from({ length: FIREWORK_COUNT }).map((_, i) => (
            <span
              key={i}
              className="puc-end__firework"
              style={{
                left: `${10 + ((i * 113) % 80)}%`,
                top: `${15 + ((i * 47) % 55)}%`,
                animationDelay: `${(i * 0.18).toFixed(2)}s`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className={`puc-end__card ${viewerWon ? 'puc-end__card--win' : 'puc-end__card--draw'}`}
      >
        {viewerWon && isGrand ? (
          <BrilliantWinCeremony
            winnerName={winnerName}
            hostId={hostId}
            recap={hostRecap}
          />
        ) : (
          <>
            <h2 id="puc-end-headline" className="puc-end__headline">{headline}</h2>
            <p className="puc-end__recap">{hostRecap}</p>
          </>
        )}

        <div className="puc-end__actions">
          {onReview && (
            <button type="button" className="puc-end__btn puc-end__btn--primary" onClick={onReview}>
              Review game
            </button>
          )}
          <button
            type="button"
            className={`puc-end__btn ${onReview ? '' : 'puc-end__btn--primary'}`}
            onClick={onNewGame}
          >
            New game
          </button>
          <button type="button" className="puc-end__btn" onClick={onBackToMenu}>
            Back to menu
          </button>
        </div>
      </div>
    </div>
  )
}

function winnerColor(status: GameStatus): Color | null {
  if (status.kind === 'checkmate') return status.winner
  if (status.kind === 'resign') return status.winner
  if (status.kind === 'timeout') return status.winner
  return null
}

function headlineFor(status: GameStatus, whiteName: string, blackName: string): string {
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate — ${status.winner === 'w' ? whiteName : blackName} wins`
    case 'resign': {
      const resigner = status.resigner === 'w' ? whiteName : blackName
      const winner = status.winner === 'w' ? whiteName : blackName
      return `${resigner} resigned — ${winner} wins`
    }
    case 'timeout': {
      const loser = status.loser === 'w' ? whiteName : blackName
      const winner = status.winner === 'w' ? whiteName : blackName
      return `${loser} ran out of time — ${winner} wins`
    }
    case 'stalemate':
      return 'Stalemate'
    case 'draw':
      return `Draw — ${status.reason.replace('_', ' ')}`
    case 'in_progress':
      return ''
  }
}
