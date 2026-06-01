// Server-driven Wizard's Duel screen. The room doc is the source of truth;
// every move and spell is submitted to a Cloud Function and we react to
// the Firestore snapshot. Mana is the caller's live castle-points balance.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { piecesFromFen } from '../../chess/fen'
import type { Color, Piece, Square } from '../../chess/types'
import { useSound } from '../../sound/useSound'
import { useCastle } from '../../castle/useCastle'
import { useAuthUid } from '../../auth/useAuthUid'
import { callSubmitWizardMove, callSubmitWizardSpell } from '../../firebase/callables'
import { pickPowerUpVariant } from '../../powerups/powerUpVariant'
import { WizardBoard, type WizardBoardMode } from './WizardBoard'
import { Spellbook } from './Spellbook'
import { WizardChess } from './WizardChess'
import { SPELLS, spellById, TARGET_SPECS } from './spells'
import type { Effect, SpellId } from './types'
import type { WizardRoomDoc } from './useWizardRoom'
import './WizardDuelScreen.css'

type CastFlow =
  | { stage: 'idle' }
  | { stage: 'awaiting-1st'; spellId: SpellId }
  | { stage: 'awaiting-2nd'; spellId: SpellId; first: Square }

const SQUARE_SIZE = 60

interface Props {
  roomId: string
  room: WizardRoomDoc
  onExit: () => void
}

export function WizardRoomScreen({ roomId, room, onExit }: Props) {
  const sound = useSound()
  const auth = useAuthUid()
  const { identity, setCastlePoints } = useCastle()
  const navigate = useNavigate()
  const [cast, setCast] = useState<CastFlow>({ stage: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Rebuild a transient engine instance from the room doc — used only as a
  // read-only oracle for legal moves / spell targets / status. Never mutated.
  const engine = useMemo(() => {
    return WizardChess.fromState({
      fen: room.fen,
      currentTurn: room.currentTurn,
      effects: room.effects as unknown as Parameters<typeof WizardChess.fromState>[0]['effects'],
    })
  }, [room.fen, room.currentTurn, room.effects])

  const fen = engine.fen()
  const pieces = useMemo(() => piecesFromFen(fen), [fen]) as Partial<Record<Square, Piece>>
  const effects = engine.allEffects()

  const uid = auth.status === 'ready' ? auth.uid : null
  const yourColor: Color | null = !uid
    ? null
    : room.white.uid === uid ? 'w' : room.black?.uid === uid ? 'b' : null
  const yourTurn = yourColor === room.currentTurn
  const isOver = room.status === 'completed'
  const winner = room.winner
  const callerPoints = identity?.castlePoints ?? 0

  // Whose name to show beside the spellbook (always the caller for one-tab
  // online play). On the opposite side, just the opponent's name.
  const opponent: Color = yourColor === 'w' ? 'b' : 'w'

  const castable = useMemo(() => {
    const out = new Set<SpellId>()
    if (!yourColor || !yourTurn || isOver) return out
    if (identity?.isBypass) return out
    for (const s of SPELLS) {
      if (callerPoints < s.cost) continue
      if (engine.validTargetsFor(s.id).length === 0) continue
      out.add(s.id)
    }
    return out
  }, [callerPoints, engine, yourColor, yourTurn, isOver, identity?.isBypass])

  const legalDestinationsFrom = useCallback(
    (sq: Square) => engine.legalDestinationsFrom(sq) as Square[],
    [engine],
  )

  const handleMove = useCallback(
    async (from: Square, to: Square) => {
      if (!yourTurn || submitting) return
      setSubmitting(true)
      setError(null)
      try {
        const captured = engine.pieceAt(to)
        await callSubmitWizardMove({ roomId, from, to })
        sound.play(captured ? 'capture' : 'move')
      } catch (e) {
        setError(humanError(e))
      } finally {
        setSubmitting(false)
      }
    },
    [engine, roomId, yourTurn, submitting, sound],
  )

  const handlePickSpell = useCallback((spellId: SpellId) => {
    setCast({ stage: 'awaiting-1st', spellId })
    setError(null)
  }, [])

  const handleCancelCast = useCallback(() => setCast({ stage: 'idle' }), [])

  const submitSpell = useCallback(
    async (spellId: SpellId, targets: Square[]) => {
      setSubmitting(true)
      setError(null)
      try {
        const res = await callSubmitWizardSpell({
          roomId,
          spellId,
          targets,
        })
        sound.play(`powerup-${pickPowerUpVariant()}` as const)
        setCastlePoints(res.castlePoints)
        setCast({ stage: 'idle' })
      } catch (e) {
        setError(humanError(e))
        setCast({ stage: 'idle' })
      } finally {
        setSubmitting(false)
      }
    },
    [roomId, sound, setCastlePoints],
  )

  const handleSpellTarget = useCallback(
    async (sq: Square) => {
      if (cast.stage === 'idle' || !yourTurn || submitting) return
      const spec = TARGET_SPECS[cast.spellId]
      if (cast.stage === 'awaiting-1st') {
        if (spec.arity === 1) {
          await submitSpell(cast.spellId, [sq])
        } else {
          setCast({ stage: 'awaiting-2nd', spellId: cast.spellId, first: sq })
        }
        return
      }
      await submitSpell(cast.spellId, [cast.first, sq])
    },
    [cast, yourTurn, submitting, submitSpell],
  )

  const boardMode: WizardBoardMode = useMemo(() => {
    if (cast.stage === 'idle') return { kind: 'move' }
    const validTargets = new Set<Square>(
      cast.stage === 'awaiting-1st'
        ? engine.validTargetsFor(cast.spellId) as Square[]
        : engine.validSecondaryTargetsFor(cast.spellId, cast.first) as Square[],
    )
    return {
      kind: 'spell-pick',
      validTargets,
      firstPick: cast.stage === 'awaiting-2nd' ? cast.first : null,
    }
  }, [cast, engine])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/wizard/${roomId}`)
    } catch {
      // ignore — fallback could be a manual prompt
    }
  }, [roomId])

  // If you opened the link but aren't a player (room is full, etc), bail.
  useEffect(() => {
    if (room.status === 'live' && !yourColor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError('This duel is already in progress between two other guests.')
    }
  }, [room.status, yourColor])

  return (
    <div className="puc-wd">
      <header className="puc-wd__header">
        <button type="button" className="puc-wd__back" onClick={onExit}>
          ← Back to the Hall
        </button>
        <h1 className="puc-wd__title">Wizard&apos;s Duel</h1>
        <span className="puc-wd__sub">
          {room.white.displayName} vs {room.black?.displayName ?? 'waiting…'}
        </span>
      </header>

      <main className="puc-wd__main">
        <aside className="puc-wd__side puc-wd__side--top">
          <PlayerRow
            name={(opponent === 'w' ? room.white : room.black)?.displayName ?? '—'}
            color={opponent}
            turn={room.currentTurn === opponent}
            label={yourColor ? 'Opponent' : 'Black'}
          />
        </aside>

        <div className="puc-wd__center">
          <div className="puc-wd__board-stage" style={{ width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}>
            <WizardBoard
              pieces={pieces}
              turn={room.currentTurn}
              effects={effects as ReadonlyMap<Square, readonly Effect[]>}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={(f, t) => { void handleMove(f, t) }}
              onSpellTarget={(s) => { void handleSpellTarget(s) }}
              mode={boardMode}
              squareSize={SQUARE_SIZE}
            />
            {room.status === 'waiting' && (
              <WaitingOverlay roomId={roomId} onCopy={copyLink} />
            )}
            {isOver && (
              <div className="puc-wd__overlay">
                <div className="puc-wd__overlay-card">
                  <h2 className="puc-wd__overlay-title">
                    {(winner === 'w' ? room.white.displayName : room.black?.displayName) ?? '—'} wins!
                  </h2>
                  <p className="puc-wd__overlay-sub">The duel is over.</p>
                  <div className="puc-wd__overlay-actions">
                    <button type="button" className="puc-wd__overlay-btn" onClick={onExit}>
                      Back to Hall
                    </button>
                    <button
                      type="button"
                      className="puc-wd__overlay-btn puc-wd__overlay-btn--ghost"
                      onClick={() => navigate('/wizard', { replace: true })}
                    >
                      New duel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="puc-wd__hint">
            {room.status === 'waiting' && 'Share the link with a friend. The duel starts when they join.'}
            {room.status === 'live' && cast.stage === 'idle' && (
              yourTurn ? 'Your turn — move a piece or cast a spell.' : 'Waiting for your opponent…'
            )}
            {cast.stage === 'awaiting-1st' && `Pick a target for ${spellById(cast.spellId).id}.`}
            {cast.stage === 'awaiting-2nd' && 'Pick the second piece to swap.'}
            {cast.stage !== 'idle' && (
              <button type="button" className="puc-wd__cancel" onClick={handleCancelCast}>cancel</button>
            )}
          </p>
          {error && <p className="puc-wd__error">{error}</p>}
        </div>

        <aside className="puc-wd__side puc-wd__side--right">
          <PlayerRow
            name={(yourColor === 'w' ? room.white : room.black)?.displayName ?? '—'}
            color={yourColor ?? 'w'}
            turn={yourTurn}
            label="You"
          />
          {yourColor && !identity?.isBypass && (
            <div className="puc-wd__points">
              <span className="puc-wd__points-label">Castle points (mana)</span>
              <span className="puc-wd__points-num">{callerPoints}</span>
            </div>
          )}
          {identity?.isBypass && (
            <p className="puc-wd__bypassnote">
              You&apos;re a bypass guest — you can move pieces but not cast spells (no castle points to spend).
            </p>
          )}
          <Spellbook
            mana={callerPoints}
            activeSpell={cast.stage === 'idle' ? null : cast.spellId}
            castable={castable}
            onPick={handlePickSpell}
          />
        </aside>
      </main>
    </div>
  )
}

function WaitingOverlay({ roomId, onCopy }: { roomId: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="puc-wd__overlay">
      <div className="puc-wd__overlay-card">
        <h2 className="puc-wd__overlay-title">Waiting for an opponent</h2>
        <p className="puc-wd__overlay-sub">Send this room link to a friend:</p>
        <code className="puc-wd__overlay-roomid">/wizard/{roomId}</code>
        <div className="puc-wd__overlay-actions">
          <button
            type="button"
            className="puc-wd__overlay-btn"
            onClick={() => { void onCopy(); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PlayerRow({
  name, color, turn, label,
}: {
  name: string
  color: Color
  turn: boolean
  label: string
}) {
  return (
    <div className={`puc-wd__player puc-wd__player--${color}${turn ? ' puc-wd__player--turn' : ''}`}>
      <span className="puc-wd__player-name">{turn ? '▸ ' : ''}{name}</span>
      <span className="puc-wd__player-label">{label}</span>
    </div>
  )
}

function humanError(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^FirebaseError: /, '')
  return String(e)
}
