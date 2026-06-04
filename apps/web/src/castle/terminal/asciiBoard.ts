// Render a chess.js position as a monospace ASCII board for the
// terminal. The terminal already wraps lines in a monospaced <pre>,
// so we just need to emit 8 rows of 8 squares with rank/file labels.
//
// Layout:
//      a b c d e f g h
//   8  r n b q k b n r
//   7  p p p p p p p p
//   …
//   1  R N B Q K B N R
//
// Capital letters are White, lowercase Black, '·' is an empty square.
// (Standard "FEN-style" letters — readable to a kid who's seen PGN.)

import type { Chess } from 'chess.js'

const RANK_TOP = 8

export function renderAsciiBoard(game: Chess): string {
  const board = game.board() // 8x8 from rank 8 down to rank 1
  const lines: string[] = []
  lines.push('     a b c d e f g h')
  for (let r = 0; r < 8; r++) {
    const rank = RANK_TOP - r
    const row = board[r]!
    const cells = row.map((sq) => {
      if (!sq) return '·'
      const letter = sq.type
      return sq.color === 'w' ? letter.toUpperCase() : letter
    })
    lines.push(`  ${rank}  ${cells.join(' ')}`)
  }
  lines.push('')
  const turn = game.turn() === 'w' ? 'White' : 'Black'
  lines.push(`  ${turn} to move.`)
  return lines.join('\n')
}
