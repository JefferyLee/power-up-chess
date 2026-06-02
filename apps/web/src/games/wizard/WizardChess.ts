// WizardChess (client side, V2 — online).
//
// Used by the WizardRoomScreen as a READ-ONLY oracle reconstructed from
// each Firestore snapshot: piece positions, effect overlays, legal moves
// for highlighting, valid spell targets. Mutations (move, castSpell)
// happen on the server via Cloud Functions; we never call them locally
// anymore.
//
// Kept structurally identical to functions/src/games/wizard/WizardChess.ts
// so move / spell semantics stay in lock-step.

import { Chess } from 'chess.js'
import type { Color, Piece, PieceSymbol, Square } from '../../chess/types'
import { isInHalfOf, spellById, TARGET_SPECS } from './spells'
import type { BoardView, Effect, SpellId, WizardStatus } from './types'

export interface WizardRoomState {
  fen: string
  currentTurn: Color
  effects: SerializedEffect[]
}

export interface SerializedEffect {
  square: Square
  kind: Effect['kind']
  affectedColor: Color
  caster: Color
  expiresAtPly: number
}

export class WizardChess {
  private chess: Chess
  private currentTurn: Color = 'w'
  private effects: Map<Square, Effect[]> = new Map()

  constructor(fen?: string) {
    this.chess = new Chess(fen)
    this.currentTurn = this.chess.turn()
  }

  /** Reconstruct a read-only oracle engine from a Firestore room snapshot.
   *  Ply count + action history aren't tracked on the client (the room doc
   *  is the source of truth for those); we only need fen + currentTurn +
   *  effects to evaluate legal moves and spell targets. */
  static fromState(state: WizardRoomState): WizardChess {
    const g = new WizardChess(state.fen)
    g.currentTurn = state.currentTurn
    g.effects = new Map()
    for (const s of state.effects) {
      const list = g.effects.get(s.square) ?? []
      list.push({
        kind: s.kind,
        affectedColor: s.affectedColor,
        caster: s.caster,
        expiresAtPly: s.expiresAtPly,
      })
      g.effects.set(s.square, list)
    }
    const parts = g.chess.fen().split(' ')
    if (parts[1] !== g.currentTurn) {
      parts[1] = g.currentTurn
      g.chess.load(parts.join(' '))
    }
    return g
  }

  fen(): string { return this.chess.fen() }
  turn(): Color { return this.currentTurn }

  status(): WizardStatus {
    if (this.chess.isCheckmate()) {
      const winner: Color = this.chess.turn() === 'w' ? 'b' : 'w'
      return { kind: 'king_captured', winner }
    }
    return { kind: 'in_progress', turn: this.currentTurn }
  }

  pieceAt(square: Square): Piece | null {
    const p = this.chess.get(square)
    return p ? { type: p.type, color: p.color } : null
  }

  effectsAt(square: Square): Effect[] {
    return this.effects.get(square) ?? []
  }

  allEffects(): ReadonlyMap<Square, readonly Effect[]> {
    return this.effects
  }

  boardView(): BoardView {
    return {
      pieceAt: (sq) => this.pieceAt(sq),
      hasEffect: (sq, kind) => this.effectsAt(sq).some((e) => e.kind === kind),
      isInOwnHalf: (sq, color) => isInHalfOf(sq, color),
    }
  }

  legalDestinationsFrom(square: Square): Square[] {
    if (this.chess.isGameOver()) return []
    const piece = this.pieceAt(square)
    if (!piece) return []
    if (piece.color !== this.currentTurn) return []
    if (this.effectsAt(square).some((e) => e.kind === 'freeze')) return []

    const verboseRaw = this.chess.moves({ square, verbose: true })
    let targets: Square[] = verboseRaw.map((m) => (m as { to: Square }).to)

    if (this.effectsAt(square).some((e) => e.kind === 'confuse')) {
      targets = targets.filter((t) => this.pieceAt(t) === null)
    }

    targets = targets.filter((t) => {
      const target = this.pieceAt(t)
      if (!target) return true
      return !this.effectsAt(t).some((e) => e.kind === 'shield')
    })

    if (this.effectsAt(square).some((e) => e.kind === 'phantom')) {
      const extras = phantomDestinations(square, piece, this.chess, this.effects)
      const merged = new Set<Square>([...targets, ...extras])
      targets = [...merged]
    }

    return targets
  }

  validTargetsFor(spellId: SpellId): Square[] {
    const spec = TARGET_SPECS[spellId]
    if (spec.arity === 0 || !spec.isValidFirstTarget) return []
    const view = this.boardView()
    return ALL_SQUARES.filter((sq) => spec.isValidFirstTarget!(sq, view, this.currentTurn))
  }

  /** True iff this spell has at least one legal target (arity-1/2) OR is
   *  a self-cast and the game is in progress (arity-0). */
  canCastSpell(spellId: SpellId): boolean {
    if (this.chess.isGameOver()) return false
    const spec = TARGET_SPECS[spellId]
    if (spec.arity === 0) return true
    return this.validTargetsFor(spellId).length > 0
  }

  validSecondaryTargetsFor(spellId: SpellId, first: Square): Square[] {
    const spec = TARGET_SPECS[spellId]
    if (spec.arity !== 2 || !spec.isValidSecondTarget) return []
    const view = this.boardView()
    return ALL_SQUARES.filter((sq) => spec.isValidSecondTarget!(sq, first, view, this.currentTurn))
  }

  // Note: no move() / castSpell() on the client. Server-only operations now.
  // The `spellById` import is kept for the (intentionally unused-here)
  // server-mirror parity; remove if you trim it later.
  /* c8 ignore next */
  static _spellById(id: SpellId) { return spellById(id) }
}

const ALL_SQUARES: Square[] = (() => {
  const out: Square[] = []
  const files = 'abcdefgh'
  for (let r = 1; r <= 8; r++) for (const f of files) out.push(`${f}${r}` as Square)
  return out
})()

const SLIDER_DIRS: Partial<Record<PieceSymbol, Array<[number, number]>>> = {
  r: [[0, 1], [0, -1], [1, 0], [-1, 0]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
}

function phantomDestinations(
  square: Square,
  piece: Piece,
  chess: Chess,
  effects: Map<Square, Effect[]>,
): Square[] {
  const dirs = SLIDER_DIRS[piece.type]
  if (!dirs) return []
  const out: Square[] = []
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const rank = Number(square[1]) - 1
  for (const [df, dr] of dirs) {
    for (let step = 1; step < 8; step++) {
      const f = file + df * step
      const r = rank + dr * step
      if (f < 0 || f > 7 || r < 0 || r > 7) break
      const sq = `${String.fromCharCode('a'.charCodeAt(0) + f)}${r + 1}` as Square
      const occupant = chess.get(sq)
      if (!occupant) { out.push(sq); continue }
      if (occupant.color === piece.color) continue
      const shielded = (effects.get(sq) ?? []).some((e) => e.kind === 'shield')
      if (!shielded) out.push(sq)
    }
  }
  return out
}
