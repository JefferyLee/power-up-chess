// Keyboard cursor for the 3D board — the pure half. Board3D wires the
// key events; everything here is a function of (cursor, key, board
// state) so it can be unit-tested without a canvas.
//
// Mirrors board/Board.tsx: a null cursor starts from the home square
// (e2 for White, e7 for Black), arrows walk one square in board
// coordinates from the player's side, edges clamp.

import type { Color, Piece, PieceSymbol, Square } from '../chess/types'

const DIRS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/** Next cursor square for an arrow key, or null when `key` isn't one. */
export function stepCursor(cur: Square | null, key: string, side: Color): Square | null {
  const dir = DIRS[key]
  if (!dir) return null
  const from = cur ?? (side === 'w' ? 'e2' : 'e7')
  const sign = side === 'w' ? 1 : -1
  const file = from.charCodeAt(0) - 97 + dir[0] * sign
  const rank = Number(from[1]) - 1 + dir[1] * sign
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return from
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square
}

function pieceName(p: Piece): string {
  return `${p.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[p.type]}`
}

/** What the live region says when the cursor lands on a square. */
export function describeSquare(
  sq: Square,
  piece: Piece | null,
  legal: ReadonlySet<Square>,
  capture: ReadonlySet<Square>,
): string {
  const what = piece ? pieceName(piece) : 'empty'
  if (capture.has(sq)) return `${sq}, ${what}, capture available`
  if (legal.has(sq)) return `${sq}, ${what}, legal move`
  return `${sq}, ${what}`
}

/** What the live region says when Enter/Space fires on `sq`. Follows
 *  the same branch order as Board3D's tap(). */
export function describeAction(
  sq: Square,
  piece: Piece | null,
  selected: Square | null,
  selectedPiece: Piece | null,
  legal: ReadonlySet<Square>,
  turn: Color,
): string {
  if (selected === sq) return 'Selection cleared'
  if (selected && legal.has(sq)) {
    const mover = selectedPiece ? PIECE_NAMES[selectedPiece.type] : 'piece'
    return `${mover} ${selected} ${piece ? 'takes' : 'to'} ${sq}`
  }
  if (piece && piece.color === turn) return `${sq} ${PIECE_NAMES[piece.type]} selected`
  if (selected) return 'Selection cleared'
  return 'Pick one of your pieces first'
}
