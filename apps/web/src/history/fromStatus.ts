// Derive SavedGame.result and .endReason from a terminal GameStatus.

import type { GameStatus } from '../chess/types'
import type { EndReason } from '../rooms/types'

export interface ResultParts {
  result: 'white' | 'black' | 'draw'
  endReason: EndReason
}

export function resultPartsFromStatus(status: GameStatus): ResultParts | null {
  switch (status.kind) {
    case 'in_progress':
      return null
    case 'checkmate':
      return {
        result: status.winner === 'w' ? 'white' : 'black',
        endReason: 'checkmate',
      }
    case 'resign':
      return {
        result: status.winner === 'w' ? 'white' : 'black',
        endReason: 'resign',
      }
    case 'stalemate':
      return { result: 'draw', endReason: 'stalemate' }
    case 'draw':
      return { result: 'draw', endReason: status.reason }
    case 'timeout':
      return {
        result: status.winner === 'w' ? 'white' : 'black',
        endReason: 'timeout',
      }
  }
}
