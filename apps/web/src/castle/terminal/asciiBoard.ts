// Render a chess.js position as a monospace ASCII board for the
// terminal.
//
// Design notes:
//
//   • Unicode chess glyphs, REVERSED from the print convention:
//     white pieces are filled (♚♛♜♝♞♟), black pieces are outlined
//     (♔♕♖♗♘♙). The standard convention assumes a light page, where
//     filled = dark = black. Our terminal is dark — flip it so "the
//     visually heavy side is the player I am."
//
//   • Each cell is 3 columns wide so the brackets used for last-move
//     highlighting (`[♛]`) don't break alignment.
//
//   • Last move is marked by bracketing both the from-square (now
//     empty) and the to-square (now has the piece).
//
//   • A "+ Check" line is appended when the side-to-move is in check.

import type { Chess, Square } from 'chess.js'

const RANK_TOP = 8

const FILLED: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const OUTLINED: Record<string, string> = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }

const EMPTY = '·'

export interface BoardRenderOpts {
  /** Square the most recent move started on — bracketed in the render. */
  lastFrom?: Square | null
  /** Square the most recent move landed on — bracketed in the render. */
  lastTo?: Square | null
}

export function renderAsciiBoard(game: Chess, opts: BoardRenderOpts = {}): string {
  const board = game.board()
  const from = opts.lastFrom ?? null
  const to = opts.lastTo ?? null

  const lines: string[] = []
  lines.push('     a  b  c  d  e  f  g  h')

  for (let r = 0; r < 8; r++) {
    const rank = RANK_TOP - r
    const row = board[r]!
    const cells: string[] = []
    for (let f = 0; f < 8; f++) {
      const sq = row[f]
      const squareName = `${'abcdefgh'[f]}${rank}` as Square
      const highlighted = squareName === from || squareName === to
      const glyph = sq
        ? (sq.color === 'w' ? FILLED[sq.type]! : OUTLINED[sq.type]!)
        : EMPTY
      // 3-col cells: bracketed when highlighted, padded otherwise.
      cells.push(highlighted ? `[${glyph}]` : ` ${glyph} `)
    }
    lines.push(`  ${rank} ${cells.join('')} ${rank}`)
  }
  lines.push('     a  b  c  d  e  f  g  h')
  lines.push('')

  const turn = game.turn() === 'w' ? 'White' : 'Black'
  if (game.inCheck()) {
    lines.push(`  + ${turn} is in check.`)
  } else {
    lines.push(`  ${turn} to move.`)
  }
  return lines.join('\n')
}
