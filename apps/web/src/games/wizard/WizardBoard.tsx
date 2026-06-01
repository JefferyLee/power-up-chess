// Board renderer for Wizard's Duel. Click-only (no drag) with two
// interaction modes:
//   - 'move' — select your own piece, then click a destination.
//   - 'spell-pick' — click any square; the parent decides if it's a valid
//     spell target.
// Overlays status-effect badges (❄ 😵‍💫 🛡 👻) on affected squares.

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Piece } from '../../board/Piece'
import { Square, type SquareHighlights } from '../../board/Square'
import { squareColor, squaresInVisualOrder } from '../../board/squares'
import type { Color, Piece as PieceModel, Square as SquareName } from '../../chess/types'
import type { Effect, EffectKind } from './types'
import './WizardBoard.css'

export type WizardBoardMode =
  | { kind: 'move' }
  | {
      kind: 'spell-pick'
      /** Squares the player can pick right now. */
      validTargets: Set<SquareName>
      /** If we're on the second click of a 2-arity spell, the first pick is
       *  highlighted differently so the user knows what they already chose. */
      firstPick?: SquareName | null
    }

interface Props {
  pieces: Partial<Record<SquareName, PieceModel>>
  turn: Color
  /** Map of squares → current effects on that square. */
  effects: ReadonlyMap<SquareName, readonly Effect[]>
  legalDestinationsFrom: (from: SquareName) => SquareName[]
  onMove: (from: SquareName, to: SquareName) => void
  onSpellTarget?: (square: SquareName) => void
  mode: WizardBoardMode
  squareSize?: number
}

export function WizardBoard({
  pieces,
  turn,
  effects,
  legalDestinationsFrom,
  onMove,
  onSpellTarget,
  mode,
  squareSize = 64,
}: Props) {
  const [selected, setSelected] = useState<SquareName | null>(null)

  const legalFromSelected = useMemo(
    () => (selected && mode.kind === 'move' ? new Set(legalDestinationsFrom(selected)) : new Set<SquareName>()),
    [selected, legalDestinationsFrom, mode.kind],
  )

  const handleClick = (sq: SquareName) => {
    if (mode.kind === 'spell-pick') {
      if (mode.validTargets.has(sq)) onSpellTarget?.(sq)
      return
    }
    // Move mode.
    const piece = pieces[sq] ?? null
    if (selected) {
      if (sq === selected) { setSelected(null); return }
      if (legalFromSelected.has(sq)) {
        onMove(selected, sq)
        setSelected(null)
        return
      }
      if (piece && piece.color === turn) { setSelected(sq); return }
      setSelected(null)
      return
    }
    if (piece && piece.color === turn) setSelected(sq)
  }

  const cells = useMemo(() => squaresInVisualOrder('w'), [])
  const styleVars: CSSProperties = { ['--puc-square-size' as string]: `${squareSize}px` }

  return (
    <div
      className="puc-wizardboard"
      style={styleVars}
      role="grid"
      aria-label="Wizard's Duel board"
      onClick={(e) => {
        const target = (e.target as HTMLElement).closest('[data-square]') as HTMLElement | null
        const sq = target?.dataset.square as SquareName | undefined
        if (sq) handleClick(sq)
      }}
    >
      {cells.map(({ file, rank }) => {
        const sq = `${file}${rank}` as SquareName
        const piece = pieces[sq] ?? null
        const sqEffects = effects.get(sq) ?? []
        const isLegalDest = legalFromSelected.has(sq)
        const isCapture = isLegalDest && !!piece && piece.color !== turn
        const isSpellTarget = mode.kind === 'spell-pick' && mode.validTargets.has(sq)
        const isFirstPick = mode.kind === 'spell-pick' && mode.firstPick === sq
        const highlights: SquareHighlights = {
          selected: selected === sq || isFirstPick,
          legalDestination: isLegalDest,
          legalCapture: isCapture,
        }
        return (
          <Square
            key={sq}
            square={sq}
            color={squareColor(file, rank)}
            highlights={highlights}
            fileLabel={rank === '1' ? file : undefined}
            rankLabel={file === 'a' ? rank : undefined}
          >
            {piece && <Piece piece={piece} />}
            {sqEffects.length > 0 && <EffectStack effects={sqEffects} />}
            {isSpellTarget && <span className="puc-wizardboard__targetring" />}
          </Square>
        )
      })}
    </div>
  )
}

function EffectStack({ effects }: { effects: readonly Effect[] }) {
  return (
    <span className="puc-wizardboard__effects" aria-hidden="true">
      {effects.map((e, i) => (
        <span key={`${e.kind}-${i}`} className={`puc-wizardboard__effect puc-wizardboard__effect--${e.kind}`}>
          {effectIcon(e.kind)}
        </span>
      ))}
    </span>
  )
}

function effectIcon(kind: EffectKind): string {
  switch (kind) {
    case 'freeze':  return '❄'
    case 'confuse': return '😵‍💫'
    case 'shield':  return '🛡'
    case 'phantom': return '👻'
  }
}
