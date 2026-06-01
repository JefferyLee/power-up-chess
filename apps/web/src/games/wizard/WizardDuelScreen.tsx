// WizardDuelScreen — V1 local two-player. White and Black share the same
// device; whoever's turn it is sees their spellbook on the right.
//
// State machine for the cast flow:
//   idle               → player either makes a move or clicks a spell
//   awaiting-1st       → spell picked, board switched to 'spell-pick'
//   awaiting-2nd       → first target picked (teleport only), waiting for 2nd
//   resolved           → spell or move applied; loop back to idle

import { useCallback, useMemo, useReducer, useState } from 'react'
import { piecesFromFen } from '../../chess/fen'
import type { Square, Piece } from '../../chess/types'
import { useSound } from '../../sound/useSound'
import { WizardBoard, type WizardBoardMode } from './WizardBoard'
import { Spellbook } from './Spellbook'
import { WizardChess } from './WizardChess'
import { spellById, TARGET_SPECS } from './spells'
import type { SpellId } from './types'
import { pickPowerUpVariant } from '../../powerups/powerUpVariant'
import './WizardDuelScreen.css'

interface Props {
  onExit: () => void
  whiteName: string
  blackName: string
}

type CastFlow =
  | { stage: 'idle' }
  | { stage: 'awaiting-1st'; spellId: SpellId }
  | { stage: 'awaiting-2nd'; spellId: SpellId; first: Square }

const SQUARE_SIZE = 60

export function WizardDuelScreen({ onExit, whiteName, blackName }: Props) {
  const sound = useSound()
  // Wrap WizardChess in useReducer-style: any state mutation re-runs the
  // render against the (mutated) engine. We bump a tick to force re-render
  // since the engine itself isn't React-aware.
  const [game] = useState(() => new WizardChess())
  const [, forceTick] = useReducer((x: number) => x + 1, 0)
  const [cast, setCast] = useState<CastFlow>({ stage: 'idle' })

  const status = game.status()
  const turn = game.turn()
  const mana = game.mana()
  const fen = game.fen()
  const pieces = useMemo(() => piecesFromFen(fen), [fen]) as Partial<Record<Square, Piece>>
  const effects = game.allEffects()

  // Set of castable spells right now (caster has enough mana + ≥1 target).
  const castable = useMemo(() => {
    const out = new Set<SpellId>()
    for (const id of ['freeze', 'confuse', 'shield', 'phantom', 'teleport', 'summon'] as SpellId[]) {
      if (game.canCastSpell(id)) out.add(id)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, mana.w, mana.b])

  const legalDestinationsFrom = useCallback(
    (sq: Square) => game.legalDestinationsFrom(sq) as Square[],
    [game],
  )

  const handleMove = useCallback(
    (from: Square, to: Square) => {
      const rec = game.move({ from, to })
      if (rec && rec.kind === 'move') {
        sound.play(rec.captured ? 'capture' : 'move')
        forceTick()
      }
    },
    [game, sound],
  )

  const handlePickSpell = useCallback((spellId: SpellId) => {
    setCast({ stage: 'awaiting-1st', spellId })
  }, [])

  const handleCancelCast = useCallback(() => {
    setCast({ stage: 'idle' })
  }, [])

  const handleSpellTarget = useCallback(
    (sq: Square) => {
      if (cast.stage === 'idle') return
      const spec = TARGET_SPECS[cast.spellId]
      if (cast.stage === 'awaiting-1st') {
        if (spec.arity === 1) {
          const ok = game.castSpell(cast.spellId, [sq])
          if (ok) {
            sound.play(`powerup-${pickPowerUpVariant()}` as const)
            forceTick()
          }
          setCast({ stage: 'idle' })
          return
        }
        // 2-arity: stash the first pick and stay in target mode.
        setCast({ stage: 'awaiting-2nd', spellId: cast.spellId, first: sq })
        return
      }
      // awaiting-2nd
      const ok = game.castSpell(cast.spellId, [cast.first, sq])
      if (ok) {
        sound.play(`powerup-${pickPowerUpVariant()}` as const)
        forceTick()
      }
      setCast({ stage: 'idle' })
    },
    [cast, game, sound],
  )

  // Compute board-mode based on cast flow.
  const boardMode: WizardBoardMode = useMemo(() => {
    if (cast.stage === 'idle') return { kind: 'move' }
    const validTargets = new Set(
      cast.stage === 'awaiting-1st'
        ? game.validTargetsFor(cast.spellId)
        : game.validSecondaryTargetsFor(cast.spellId, cast.first),
    )
    return {
      kind: 'spell-pick',
      validTargets,
      firstPick: cast.stage === 'awaiting-2nd' ? cast.first : null,
    }
  }, [cast, game])

  const winner = status.kind === 'king_captured' ? status.winner : null
  const isOver = winner !== null

  const handleRestart = useCallback(() => {
    // Bare swap: throw the engine and reinit by re-mounting via key bump.
    window.location.reload()
  }, [])

  return (
    <div className="puc-wd">
      <header className="puc-wd__header">
        <button type="button" className="puc-wd__back" onClick={onExit}>
          ← Back to the Hall
        </button>
        <h1 className="puc-wd__title">Wizard&apos;s Duel</h1>
        <span className="puc-wd__sub">
          {whiteName} vs {blackName}
        </span>
      </header>

      <main className="puc-wd__main">
        <aside className="puc-wd__side puc-wd__side--top">
          <PlayerRow name={blackName} color="b" mana={mana.b} turn={turn === 'b'} />
        </aside>

        <div className="puc-wd__center">
          <div className="puc-wd__board-stage" style={{ width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}>
            <WizardBoard
              pieces={pieces}
              turn={turn}
              effects={effects}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              onSpellTarget={handleSpellTarget}
              mode={boardMode}
              squareSize={SQUARE_SIZE}
            />
            {isOver && (
              <div className="puc-wd__overlay">
                <div className="puc-wd__overlay-card">
                  <h2 className="puc-wd__overlay-title">
                    {(winner === 'w' ? whiteName : blackName)} wins!
                  </h2>
                  <p className="puc-wd__overlay-sub">The duel is over.</p>
                  <div className="puc-wd__overlay-actions">
                    <button type="button" className="puc-wd__overlay-btn" onClick={handleRestart}>
                      Play again
                    </button>
                    <button type="button" className="puc-wd__overlay-btn puc-wd__overlay-btn--ghost" onClick={onExit}>
                      Back to Hall
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="puc-wd__hint">
            {cast.stage === 'idle' && `${turn === 'w' ? whiteName : blackName} — move a piece or cast a spell.`}
            {cast.stage === 'awaiting-1st' && `Pick a target for ${spellById(cast.spellId).id}. `}
            {cast.stage === 'awaiting-2nd' && `Pick the second piece to swap.`}
            {cast.stage !== 'idle' && (
              <button type="button" className="puc-wd__cancel" onClick={handleCancelCast}>cancel</button>
            )}
          </p>
        </div>

        <aside className="puc-wd__side puc-wd__side--right">
          <PlayerRow name={whiteName} color="w" mana={mana.w} turn={turn === 'w'} />
          <Spellbook
            mana={mana[turn]}
            activeSpell={cast.stage === 'idle' ? null : cast.spellId}
            castable={castable}
            onPick={handlePickSpell}
          />
        </aside>
      </main>
    </div>
  )
}

function PlayerRow({ name, color, mana, turn }: { name: string; color: 'w' | 'b'; mana: number; turn: boolean }) {
  return (
    <div className={`puc-wd__player puc-wd__player--${color}${turn ? ' puc-wd__player--turn' : ''}`}>
      <span className="puc-wd__player-name">{turn ? '▸ ' : ''}{name}</span>
      <span className="puc-wd__player-mana">
        <span className="puc-wd__player-mana-num">{mana}</span>
        <span className="puc-wd__player-mana-label">mana</span>
      </span>
    </div>
  )
}
