// WizardChess (server side) — same engine as the client, with mana
// removed (spells now spend castle points, deducted in the Cloud
// Function that wraps castSpell) and a toJSON/fromJSON pair for
// Firestore round-tripping.

import { Chess } from 'chess.js'
import type { Color, MoveInput, Piece, PieceSymbol, Square } from '../../shared/chessTypes'
import { isInHalfOf, spellById, TARGET_SPECS } from './spells'
import type { BoardView, Effect, SpellId, WizardActionRecord, WizardStatus } from './types'

export interface WizardRoomState {
  fen: string
  currentTurn: Color
  plyCount: number
  effects: SerializedEffect[]
  actions: WizardActionRecord[]
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
  private actions: WizardActionRecord[] = []
  private plyCount = 0

  constructor(fen?: string) {
    this.chess = new Chess(fen)
    this.currentTurn = this.chess.turn()
  }

  static fromState(state: WizardRoomState): WizardChess {
    const g = new WizardChess(state.fen)
    g.currentTurn = state.currentTurn
    g.plyCount = state.plyCount
    g.actions = [...state.actions]
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
    // Keep chess.js's internal turn in sync with the deserialised one.
    const parts = g.chess.fen().split(' ')
    if (parts[1] !== g.currentTurn) {
      parts[1] = g.currentTurn
      g.chess.load(parts.join(' '))
    }
    return g
  }

  toState(): WizardRoomState {
    const effects: SerializedEffect[] = []
    for (const [square, list] of this.effects) {
      for (const e of list) {
        effects.push({
          square,
          kind: e.kind,
          affectedColor: e.affectedColor,
          caster: e.caster,
          expiresAtPly: e.expiresAtPly,
        })
      }
    }
    return {
      fen: this.chess.fen(),
      currentTurn: this.currentTurn,
      plyCount: this.plyCount,
      effects,
      actions: [...this.actions],
    }
  }

  // ── Read-only state ─────────────────────────────────────────────────────

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

  /** Apply a spell. Returns the action record on success, null otherwise.
   *  The caller is responsible for charging castle points BEFORE calling. */
  castSpell(spellId: SpellId, targets: Square[]): WizardActionRecord | null {
    const spell = spellById(spellId)
    const spec = TARGET_SPECS[spellId]
    if (targets.length !== spec.arity) return null

    const view = this.boardView()
    const caster = this.currentTurn
    if (!spec.isValidFirstTarget(targets[0]!, view, caster)) return null
    if (spec.arity === 2 && !spec.isValidSecondTarget?.(targets[1]!, targets[0]!, view, caster)) return null

    switch (spellId) {
      case 'freeze':
      case 'confuse': {
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

    const record: WizardActionRecord = { kind: 'spell', spellId, color: caster, targets }
    this.actions.push(record)
    this.afterAction()
    return record
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private swapTurn(): void {
    this.currentTurn = this.currentTurn === 'w' ? 'b' : 'w'
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

  private afterAction(): void {
    this.plyCount += 1
    this.expireStale()
    this.swapTurn()
  }

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
      if (!occupant) { out.push(sq); continue }
      if (occupant.color === piece.color) continue
      const shielded = (effects.get(sq) ?? []).some((e) => e.kind === 'shield')
      if (!shielded) out.push(sq)
    }
  }
  return out
}
