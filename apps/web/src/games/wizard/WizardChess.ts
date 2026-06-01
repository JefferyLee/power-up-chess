// WizardChess — chess.js wrapper with magic-state overlay.
//
// V1 scope (simpler than the original draft):
//   - We keep chess.js's full rule enforcement, including check + checkmate.
//     Magic effects only RESTRICT which chess-legal moves are available;
//     they don't allow illegal-in-chess moves except for Phantom (see below).
//   - Game ends per standard chess: checkmate, stalemate, draw. "King
//     capture" is unreachable in chess.js, so we model it as checkmate.
//     Spec said king-capture; deferred to V2 (would need a pseudo-legal
//     move generator + manual castling/en passant — substantial work).
//   - Phantom is the one rule-bender: a phantom piece can pass through
//     blockers, reaching squares chess.js considers blocked. Those moves
//     are applied directly via put/remove since chess.move() would reject
//     them.
//   - Each turn the moving side may MOVE one piece OR cast a spell.
//   - Mana: +1 per move, +piece-value on capture (P=1, N=B=3, R=5, Q=9).

import { Chess } from 'chess.js'
import type { Color, MoveInput, Piece, PieceSymbol, Square } from '../../chess/types'
import { isInHalfOf, spellById, TARGET_SPECS } from './spells'
import type { BoardView, Effect, SpellId, WizardActionRecord, WizardStatus } from './types'

const PIECE_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export class WizardChess {
  private chess: Chess
  private currentTurn: Color = 'w'
  private manaPool = { w: 0, b: 0 }
  private effects: Map<Square, Effect[]> = new Map()
  private actions: WizardActionRecord[] = []
  /** Absolute count of plies (moves + spell casts) since the start. Used
   *  to decide effect expiry. Set to `expiresAtPly` higher than this when
   *  an effect is added; checked < `expiresAtPly` to gate "active". */
  private plyCount = 0

  constructor(fen?: string) {
    this.chess = new Chess(fen)
    this.currentTurn = this.chess.turn()
  }

  // ── Read-only state ─────────────────────────────────────────────────────

  fen(): string { return this.chess.fen() }
  turn(): Color { return this.currentTurn }
  history(): readonly WizardActionRecord[] { return this.actions }
  mana(): { w: number; b: number } { return { ...this.manaPool } }

  /** Test-only: set mana directly so unit tests can jump straight to the
   *  state under test rather than grinding moves (which can trigger
   *  threefold repetition and silently freeze the game). */
  _setManaForTesting(w: number, b: number): void {
    this.manaPool.w = w
    this.manaPool.b = b
  }

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

  boardView(): BoardView {
    return {
      pieceAt: (sq) => this.pieceAt(sq),
      hasEffect: (sq, kind) => this.effectsAt(sq).some((e) => e.kind === kind),
      isInOwnHalf: (sq, color) => isInHalfOf(sq, color),
    }
  }

  // ── Move generation ─────────────────────────────────────────────────────

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

  // ── Move application ────────────────────────────────────────────────────

  move(input: MoveInput): WizardActionRecord | null {
    if (this.chess.isGameOver()) return null
    const piece = this.pieceAt(input.from)
    if (!piece || piece.color !== this.currentTurn) return null
    const legal = this.legalDestinationsFrom(input.from)
    if (!legal.includes(input.to)) return null

    const captured = this.pieceAt(input.to)

    let chessLegal = true
    try {
      const result = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? 'q' })
      if (!result) chessLegal = false
    } catch {
      chessLegal = false
    }
    if (!chessLegal) {
      // Phantom-only move (chess.js rejected it). Apply manually.
      this.chess.remove(input.from)
      if (captured) this.chess.remove(input.to)
      this.chess.put({ type: piece.type, color: piece.color }, input.to)
    }

    const carriedEffects = (this.effects.get(input.from) ?? []).filter((e) => e.kind !== 'phantom')
    this.effects.delete(input.from)
    this.effects.delete(input.to)
    if (carriedEffects.length > 0) {
      this.effects.set(input.to, carriedEffects)
    }

    this.manaPool[this.currentTurn] += 1
    if (captured) this.manaPool[this.currentTurn] += PIECE_VALUE[captured.type]

    const record: WizardActionRecord = {
      kind: 'move',
      from: input.from,
      to: input.to,
      color: this.currentTurn,
      piece: piece.type,
      ...(captured ? { captured: captured.type } : {}),
    }
    this.actions.push(record)

    this.afterAction()
    return record
  }

  // ── Spells ──────────────────────────────────────────────────────────────

  canCastSpell(spellId: SpellId): boolean {
    const spell = spellById(spellId)
    if (this.manaPool[this.currentTurn] < spell.cost) return false
    return this.validTargetsFor(spellId).length > 0
  }

  validTargetsFor(spellId: SpellId): Square[] {
    const spec = TARGET_SPECS[spellId]
    const view = this.boardView()
    return ALL_SQUARES.filter((sq) => spec.isValidFirstTarget(sq, view, this.currentTurn))
  }

  validSecondaryTargetsFor(spellId: SpellId, first: Square): Square[] {
    const spec = TARGET_SPECS[spellId]
    if (spec.arity !== 2 || !spec.isValidSecondTarget) return []
    const view = this.boardView()
    return ALL_SQUARES.filter((sq) => spec.isValidSecondTarget!(sq, first, view, this.currentTurn))
  }

  castSpell(spellId: SpellId, targets: Square[]): WizardActionRecord | null {
    const spell = spellById(spellId)
    if (this.manaPool[this.currentTurn] < spell.cost) return null

    const spec = TARGET_SPECS[spellId]
    if (targets.length !== spec.arity) return null

    const view = this.boardView()
    const caster = this.currentTurn
    if (!spec.isValidFirstTarget(targets[0]!, view, caster)) return null
    if (spec.arity === 2 && !spec.isValidSecondTarget?.(targets[1]!, targets[0]!, view, caster)) return null

    switch (spellId) {
      case 'freeze':
      case 'confuse': {
        // Affect opponent's piece across THEIR next 2 turns. Their turns
        // are plies plyCount+1 and plyCount+3 (interleaved with caster's).
        // Effect must drop after their 2nd affected turn → expires at +4.
        const target = targets[0]!
        const affected = this.pieceAt(target)
        if (!affected) return null
        this.addEffect(target, {
          kind: spell.id === 'freeze' ? 'freeze' : 'confuse',
          affectedColor: affected.color,
          caster,
          expiresAtPly: this.plyCount + 4,
        })
        break
      }
      case 'shield': {
        // Protect own piece for opponent's next 2 turns. Same expiry math
        // as freeze; opponent's plies are plyCount+1 and plyCount+3.
        const target = targets[0]!
        const owner = this.pieceAt(target)
        if (!owner) return null
        this.addEffect(target, {
          kind: 'shield',
          affectedColor: owner.color,
          caster,
          expiresAtPly: this.plyCount + 4,
        })
        break
      }
      case 'phantom': {
        // Last 1 of the caster's own turns. Caster's next turn is at ply
        // plyCount+2. Expires at plyCount+3 so phantom is active on +2 only.
        const target = targets[0]!
        const owner = this.pieceAt(target)
        if (!owner) return null
        this.addEffect(target, {
          kind: 'phantom',
          affectedColor: owner.color,
          caster,
          expiresAtPly: this.plyCount + 3,
        })
        break
      }
      case 'teleport': {
        const [a, b] = [targets[0]!, targets[1]!]
        const pa = this.pieceAt(a)
        const pb = this.pieceAt(b)
        if (!pa || !pb) return null
        this.chess.remove(a)
        this.chess.remove(b)
        this.chess.put({ type: pa.type, color: pa.color }, b)
        this.chess.put({ type: pb.type, color: pb.color }, a)
        const ea = this.effects.get(a)
        const eb = this.effects.get(b)
        this.effects.delete(a)
        this.effects.delete(b)
        if (eb) this.effects.set(a, eb)
        if (ea) this.effects.set(b, ea)
        break
      }
      case 'summon': {
        const target = targets[0]!
        if (this.pieceAt(target) !== null) return null
        if (!isInHalfOf(target, caster)) return null
        this.chess.put({ type: 'p', color: caster }, target)
        break
      }
    }

    this.manaPool[caster] -= spell.cost
    const record: WizardActionRecord = { kind: 'spell', spellId, color: caster, targets }
    this.actions.push(record)
    this.afterAction()
    return record
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private swapTurn(): void {
    this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w'
    // Keep chess.js's internal turn in sync. A chess.move() call already
    // flipped it; a spell did not, so this is a no-op after moves and a
    // real reload after spells.
    const parts = this.chess.fen().split(' ')
    if (parts[1] !== this.currentTurn) {
      parts[1] = this.currentTurn
      this.chess.load(parts.join(' '))
    }
  }

  private addEffect(square: Square, effect: Effect): void {
    const existing = this.effects.get(square) ?? []
    const filtered = existing.filter((e) => e.kind !== effect.kind)
    filtered.push(effect)
    this.effects.set(square, filtered)
  }

  /** Bump the ply counter, expire any effects past their expiry, then
   *  swap whose turn it is. Called from both move() and castSpell(). */
  private afterAction(): void {
    this.plyCount += 1
    this.expireStale()
    this.swapTurn()
  }

  /** Drop any effects whose expiresAtPly has passed. */
  private expireStale(): void {
    for (const [sq, list] of this.effects) {
      const kept = list.filter((e) => this.plyCount < e.expiresAtPly)
      if (kept.length === 0) this.effects.delete(sq)
      else this.effects.set(sq, kept)
    }
  }
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
      if (!occupant) {
        out.push(sq)
        continue
      }
      if (occupant.color === piece.color) continue
      const shielded = (effects.get(sq) ?? []).some((e) => e.kind === 'shield')
      if (!shielded) out.push(sq)
      // Phantom keeps going past blockers — don't break.
    }
  }
  return out
}
