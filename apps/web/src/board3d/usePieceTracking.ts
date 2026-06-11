// usePieceTracking — gives every piece on the board a STABLE identity
// across moves so the 3D renderer can keep one mesh per piece and
// animate it from square to square, instead of unmounting/remounting
// meshes keyed by coordinates (which both breaks motion and invites
// react-three-fiber disposal pitfalls for shared geometry).
//
// The board state arrives as a plain square→piece map (FEN-derived,
// no ids). We reconstruct identity by diffing against the previous
// map: a piece that stayed put keeps its id; a piece of colour+type X
// that vanished from one square while appearing on another is "the
// mover" and carries its id (and previous square) along. Captured
// pieces simply drop out of the registry.
//
// Castling moves two pieces (king + rook) — both resolve through the
// same vanish/appear matching. Promotions match the vanished pawn as
// the mover (same id, new piece type), so the queen glides in from the
// pawn's square instead of the pawn reading as "captured".

import { useRef } from 'react'
import type { Piece as PieceModel, Square as SquareName } from '../chess/types'

export interface TrackedPiece {
  id: string
  square: SquareName
  /** Square this piece just moved FROM (one render's worth) — the
   *  renderer starts the position tween there. Null when stationary. */
  movedFrom: SquareName | null
  piece: PieceModel
}

/** A piece that vanished in the latest update without being matched as
 *  a mover — i.e. it was captured (or promoted away). The renderer
 *  keeps a short-lived "dying" mesh for it at its final square. */
export interface CapturedPiece {
  id: string
  square: SquareName
  piece: PieceModel
}

export interface PieceTracking {
  tracked: TrackedPiece[]
  /** Stable per-update array — same identity until `pieces` changes. */
  captured: CapturedPiece[]
  /** True when the update looks like a board RESET (new game, next
   *  puzzle) rather than a single move — too many pieces vanished or
   *  appeared at once. The renderer should snap, not animate, and
   *  wipe capture trays. A legal move never exceeds 1 capture + 1
   *  fresh appearance. */
  bulkChange: boolean
}

let nextId = 1

const NO_CAPTURES: CapturedPiece[] = []

export function usePieceTracking(
  pieces: Partial<Record<SquareName, PieceModel>>,
): PieceTracking {
  const registry = useRef<Map<string, TrackedPiece>>(new Map())
  const capturedRef = useRef<CapturedPiece[]>(NO_CAPTURES)
  const bulkRef = useRef(false)
  const lastPieces = useRef<typeof pieces | null>(null)

  if (lastPieces.current !== pieces) {
    const prev = registry.current
    const next = new Map<string, TrackedPiece>()
    const entries = Object.entries(pieces) as Array<[SquareName, PieceModel]>

    // Pass 1 — same square, same piece: identity carries over.
    const unmatched: Array<[SquareName, PieceModel]> = []
    const consumed = new Set<string>()
    for (const [sq, piece] of entries) {
      let found: TrackedPiece | null = null
      for (const t of prev.values()) {
        if (consumed.has(t.id)) continue
        if (t.square === sq && t.piece.color === piece.color && t.piece.type === piece.type) {
          found = t
          break
        }
      }
      if (found) {
        consumed.add(found.id)
        next.set(found.id, { ...found, movedFrom: null, piece })
      } else {
        unmatched.push([sq, piece])
      }
    }

    // Pass 2 — appeared somewhere new: match to a vanished piece of the
    // same colour+type (the mover). No match (initial render, promotion,
    // undo edge cases) → fresh id, no tween.
    let freshCount = 0
    for (const [sq, piece] of unmatched) {
      let mover: TrackedPiece | null = null
      for (const t of prev.values()) {
        if (consumed.has(t.id)) continue
        if (t.piece.color === piece.color && t.piece.type === piece.type) {
          mover = t
          break
        }
      }
      // Promotion: a q/r/b/n appearing on the last rank with no same-
      // type match is the promoted pawn — find it one rank back within
      // one file (straight push or capture-promotion).
      if (!mover && piece.type !== 'p' && piece.type !== 'k') {
        const promoRank = piece.color === 'w' ? '8' : '1'
        const fromRank = piece.color === 'w' ? '7' : '2'
        if (sq[1] === promoRank) {
          for (const t of prev.values()) {
            if (consumed.has(t.id)) continue
            if (
              t.piece.color === piece.color &&
              t.piece.type === 'p' &&
              t.square[1] === fromRank &&
              Math.abs(t.square.charCodeAt(0) - sq.charCodeAt(0)) <= 1
            ) {
              mover = t
              break
            }
          }
        }
      }
      if (mover) {
        consumed.add(mover.id)
        next.set(mover.id, { id: mover.id, square: sq, movedFrom: mover.square, piece })
      } else {
        const id = `pc${nextId++}`
        next.set(id, { id, square: sq, movedFrom: null, piece })
        freshCount++
      }
    }

    // Anything in prev not consumed by either pass vanished outright —
    // captured (or a promoted-away pawn). Skip the very first update
    // (prev empty) by construction: nothing to leave behind.
    const gone: CapturedPiece[] = []
    for (const t of prev.values()) {
      if (!consumed.has(t.id)) gone.push({ id: t.id, square: t.square, piece: t.piece })
    }
    capturedRef.current = gone.length > 0 ? gone : NO_CAPTURES

    // Board reset, not a move: drop the identity of every "mover" so
    // nothing glides across the wipe — fresh ids mount in place.
    const bulk = gone.length + freshCount >= 3
    bulkRef.current = bulk
    if (bulk) {
      for (const [id, t] of [...next]) {
        if (t.movedFrom) {
          next.delete(id)
          const fid = `pc${nextId++}`
          next.set(fid, { ...t, id: fid, movedFrom: null })
        }
      }
    }

    registry.current = next
    lastPieces.current = pieces
  }

  return {
    tracked: [...registry.current.values()],
    captured: capturedRef.current,
    bulkChange: bulkRef.current,
  }
}
