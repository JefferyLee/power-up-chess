import type { GameStatus } from '../chess/types'
import './GameEndOverlay.css'

interface Props {
  status: GameStatus
  whiteName: string
  blackName: string
  hostRecap: string
  onNewGame: () => void
  onBackToMenu: () => void
  onReview?: () => void
}

const FIREWORK_COUNT = 8

export function GameEndOverlay({
  status,
  whiteName,
  blackName,
  hostRecap,
  onNewGame,
  onBackToMenu,
  onReview,
}: Props) {
  if (status.kind === 'in_progress') return null

  const isMate = status.kind === 'checkmate'
  const headline = headlineFor(status, whiteName, blackName)

  return (
    <div className="puc-end" role="dialog" aria-modal="true" aria-labelledby="puc-end-headline">
      <div className="puc-end__backdrop" />

      {isMate && (
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

      <div className={`puc-end__card ${isMate ? 'puc-end__card--win' : 'puc-end__card--draw'}`}>
        <h2 id="puc-end-headline" className="puc-end__headline">{headline}</h2>
        <p className="puc-end__recap">{hostRecap}</p>
        <div className="puc-end__actions">
          {onReview && (
            <button type="button" className="puc-end__btn puc-end__btn--primary" onClick={onReview}>
              Review game
            </button>
          )}
          <button type="button" className={`puc-end__btn ${onReview ? '' : 'puc-end__btn--primary'}`} onClick={onNewGame}>
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

function headlineFor(status: GameStatus, whiteName: string, blackName: string): string {
  switch (status.kind) {
    case 'checkmate':
      return `Checkmate — ${status.winner === 'w' ? whiteName : blackName} wins`
    case 'resign': {
      const resigner = status.resigner === 'w' ? whiteName : blackName
      const winner = status.winner === 'w' ? whiteName : blackName
      return `${resigner} resigned — ${winner} wins`
    }
    case 'stalemate':
      return 'Stalemate'
    case 'draw':
      return `Draw — ${status.reason.replace('_', ' ')}`
    case 'in_progress':
      return ''
  }
}
