// Square-name helpers. Files: 'a'..'h'. Ranks: '1'..'8'.

import type { Color, Square } from '../chess/types'

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

export type File = (typeof FILES)[number]
export type Rank = (typeof RANKS)[number]

export function squareName(file: File, rank: Rank): Square {
  return `${file}${rank}` as Square
}

/** Light/dark colour of a square, used for the board pattern. */
export function squareColor(file: File, rank: Rank): 'light' | 'dark' {
  const fi = FILES.indexOf(file)
  const ri = RANKS.indexOf(rank)
  // a1 is dark; (file+rank) even -> dark.
  return (fi + ri) % 2 === 0 ? 'dark' : 'light'
}

/** Order in which squares should be rendered for a given orientation,
 *  top-left to bottom-right of the visible grid. */
export function squaresInVisualOrder(orientation: Color): Array<{ file: File; rank: Rank }> {
  const filesOrdered = orientation === 'w' ? FILES : [...FILES].reverse()
  const ranksOrdered = orientation === 'w' ? [...RANKS].reverse() : RANKS
  const out: Array<{ file: File; rank: Rank }> = []
  for (const rank of ranksOrdered) {
    for (const file of filesOrdered) {
      out.push({ file, rank })
    }
  }
  return out
}
