// Server-driven Wizard's Duel screen. The room doc is the source of truth;
// every move and spell is submitted to a Cloud Function and we react to
// the Firestore snapshot. Mana is the caller's live castle-points balance.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { piecesFromFen } from '../../chess/fen'
import type { Color, Piece, Square } from '../../chess/types'
import { useSound } from '../../sound/useSound'
import { useCastle } from '../../castle/useCastle'
import { usePresenceHeartbeat } from '../../castle/usePresenceHeartbeat'
import { useAuthUid } from '../../auth/useAuthUid'
import { Clock } from '../../clock/Clock'
import { useResponsiveSquareSize } from '../../board/useResponsiveSquareSize'
import {
  callClaimWizardTimeWin,
  callResignWizardGame,
  callSubmitWizardMove,
  callSubmitWizardSpell,
  type SpellPricing,
} from '../../firebase/callables'
import { ResignDialog } from '../../powerups/ResignDialog'
import { pickPowerUpVariant } from '../../powerups/powerUpVariant'
import { WizardBoard, type WizardBoardMode } from './WizardBoard'
import { WizardChat } from './WizardChat'
import { WizardRoomOccupants } from './WizardRoomOccupants'
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

const MAX_SQUARE_SIZE = 60

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
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  // Broadcast presence as "in this wizard duel" so the Hall sidebar can
  // show who's here + offer a Watch button to spectators.
  usePresenceHeartbeat({ kind: 'wizard', roomId })
  const [cast, setCast] = useState<CastFlow>({ stage: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resignOpen, setResignOpen] = useState(false)
  const [resigning, setResigning] = useState(false)
  /** Surge-pricing toast: shown for ~4s after a spell costs more than its
   *  base price (personal quota burned or castle supply low). */
  const [surgeToast, setSurgeToast] = useState<{ id: number; spellId: SpellId; pricing: SpellPricing } | null>(null)

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

  // Highlight the most recent action's from→to squares so the player can
  // see what the opponent just did. Teleport surfaces both swapped squares;
  // single-target spells (freeze / shield / etc.) highlight just the target;
  // self-cast spells (extra-time) and summon don't produce a highlight.
  // React Compiler memoizes this from the deps.
  const lastTouched = computeLastTouched(room.actions)

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
      if (!engine.canCastSpell(s.id)) continue
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
        // Sound plays when the snapshot returns (see action-diff effect
        // below) so opponents + spectators hear it too, not just the mover.
        await callSubmitWizardMove({ roomId, from, to })
      } catch (e) {
        setError(humanError(e))
      } finally {
        setSubmitting(false)
      }
    },
    [roomId, yourTurn, submitting],
  )

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
        // Sound plays from the snapshot-diff effect (so the opponent hears it too).
        setCastlePoints(res.castlePoints)
        setCast({ stage: 'idle' })
        if (res.pricing.effectiveCost > res.pricing.baseCost) {
          setSurgeToast({ id: Date.now(), spellId, pricing: res.pricing })
        }
      } catch (e) {
        setError(humanError(e))
        setCast({ stage: 'idle' })
      } finally {
        setSubmitting(false)
      }
    },
    [roomId, setCastlePoints],
  )

  // Auto-dismiss surge toast after 4 s.
  useEffect(() => {
    if (!surgeToast) return
    const t = window.setTimeout(() => setSurgeToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [surgeToast])

  const handlePickSpell = useCallback((spellId: SpellId) => {
    setError(null)
    // Arity-0 spells (e.g., extra-time) fire immediately — no target picking.
    if (TARGET_SPECS[spellId].arity === 0) {
      void submitSpell(spellId, [])
      return
    }
    setCast({ stage: 'awaiting-1st', spellId })
  }, [submitSpell])

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

  const handleConfirmResign = useCallback(async () => {
    if (resigning) return
    setResigning(true)
    setError(null)
    try {
      await callResignWizardGame(roomId)
      setResignOpen(false)
      onExit()
    } catch (e) {
      setError(humanError(e))
    } finally {
      setResigning(false)
    }
  }, [resigning, roomId, onExit])

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

  // Sound on any new action — including the opponent's. Tracks the
  // last seen action count so we don't replay the whole game's sounds
  // on first load (or on every snapshot diff that isn't action-related).
  const lastSeenActionsRef = useRef<number | null>(null)
  useEffect(() => {
    const actions = room.actions
    if (lastSeenActionsRef.current === null) {
      lastSeenActionsRef.current = actions.length
      return
    }
    const seen = lastSeenActionsRef.current
    if (actions.length <= seen) return
    for (let i = seen; i < actions.length; i++) {
      const rec = actions[i]
      if (!rec) continue
      if (rec.kind === 'move') {
        sound.play(rec.captured ? 'capture' : 'move')
      } else if (rec.kind === 'spell') {
        sound.play(`powerup-${pickPowerUpVariant()}` as const)
      }
    }
    lastSeenActionsRef.current = actions.length
  }, [room.actions, sound])

  // Flag-fall watcher: if it's the opponent's turn and their clock would
  // run out before our next snapshot, schedule a claim. The server has
  // the final say; we just nudge it.
  useEffect(() => {
    if (room.status !== 'live') return
    if (!yourColor || !room.timeControl) return
    if (yourColor === room.currentTurn) return
    if (room.lastTickServerTs == null) return
    const opponentTimeMs = room.currentTurn === 'w' ? room.whiteTimeMs : room.blackTimeMs
    if (opponentTimeMs == null) return
    const remaining = opponentTimeMs - (Date.now() - room.lastTickServerTs)
    const fire = () => { void callClaimWizardTimeWin(roomId).catch(() => {}) }
    if (remaining <= 0) {
      fire()
      return
    }
    const timer = window.setTimeout(fire, remaining + 250)
    return () => window.clearTimeout(timer)
  }, [
    room.status, room.currentTurn, room.lastTickServerTs,
    room.whiteTimeMs, room.blackTimeMs, room.timeControl,
    yourColor, roomId,
  ])

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
            clockMs={opponent === 'w' ? room.whiteTimeMs : room.blackTimeMs}
            clockRunning={room.status === 'live' && room.currentTurn === opponent}
            lastTickServerTs={room.lastTickServerTs ?? null}
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
              lastTouched={lastTouched}
            />
            {room.status === 'waiting' && (
              <WaitingOverlay roomId={roomId} onCopy={copyLink} />
            )}
            {surgeToast && <SurgeToast key={surgeToast.id} spellId={surgeToast.spellId} pricing={surgeToast.pricing} />}
            {isOver && (
              <div className="puc-wd__overlay">
                <div className="puc-wd__overlay-card">
                  <h2 className="puc-wd__overlay-title">
                    {(winner === 'w' ? room.white.displayName : room.black?.displayName) ?? '—'} wins!
                  </h2>
                  <p className="puc-wd__overlay-sub">
                    {room.endReason === 'timeout'
                      ? 'Opponent ran out of time.'
                      : room.endReason === 'resign'
                        ? 'Opponent resigned.'
                        : 'The duel is over.'}
                  </p>
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
            label={yourColor ? 'You' : 'White'}
            clockMs={(yourColor ?? 'w') === 'w' ? room.whiteTimeMs : room.blackTimeMs}
            clockRunning={room.status === 'live' && room.currentTurn === (yourColor ?? 'w')}
            lastTickServerTs={room.lastTickServerTs ?? null}
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
          {yourColor && !isOver && room.status === 'live' && (
            <button
              type="button"
              className="puc-wd__resign"
              onClick={() => setResignOpen(true)}
              disabled={submitting || resigning}
            >
              🏳 Resign & leave
            </button>
          )}
          <WizardChat
            roomId={roomId}
            yourRole={yourColor !== null ? 'player' : 'spectator'}
            isBypass={!!identity?.isBypass}
            callerPoints={callerPoints}
            yourColor={yourColor}
            onPosted={setCastlePoints}
          />
          <WizardRoomOccupants
            roomId={roomId}
            playerUids={{
              w: { uid: room.white.uid, name: room.white.displayName },
              b: room.black ? { uid: room.black.uid, name: room.black.displayName } : null,
            }}
            youUid={uid}
          />
        </aside>
      </main>
      {resignOpen && (
        <ResignDialog
          mode="online"
          yourName={(yourColor === 'w' ? room.white : room.black)?.displayName ?? 'You'}
          busy={resigning}
          onResign={() => { void handleConfirmResign() }}
          onCancel={() => setResignOpen(false)}
        />
      )}
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

function SurgeToast({ spellId, pricing }: { spellId: SpellId; pricing: SpellPricing }) {
  // Explain which axis (or both) drove the surge so kids learn the rule.
  const reasons: string[] = []
  if (pricing.personalMultiplier > 1) {
    reasons.push(`your ${ordinalSuffix(pricing.personalCastCount)} cast today`)
  }
  if (pricing.supplyMultiplier > 1) {
    reasons.push(`castle supply low (${pricing.supplyRemaining} left)`)
  }
  const totalMult = (pricing.effectiveCost / pricing.baseCost).toFixed(1).replace(/\.0$/, '')
  return (
    <div className="puc-wd__surge" role="status">
      <span className="puc-wd__surge-icon" aria-hidden="true">⚡</span>
      <span className="puc-wd__surge-body">
        <b>{spellId}</b> surged: {pricing.baseCost} → <b>{pricing.effectiveCost}</b> pt
        {' '}(×{totalMult})
        {reasons.length > 0 && <span className="puc-wd__surge-reason">{' — '}{reasons.join(' & ')}</span>}
      </span>
    </div>
  )
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'] as const
  const v = n % 100
  const suffix = s[(v - 20) % 10] ?? s[v] ?? s[0]
  return `${n}${suffix}`
}

function PlayerRow({
  name, color, turn, label, clockMs, clockRunning, lastTickServerTs,
}: {
  name: string
  color: Color
  turn: boolean
  label: string
  clockMs: number | undefined
  clockRunning: boolean
  lastTickServerTs: number | null
}) {
  return (
    <div className={`puc-wd__player puc-wd__player--${color}${turn ? ' puc-wd__player--turn' : ''}`}>
      <div className="puc-wd__player-info">
        <span className="puc-wd__player-name">{turn ? '▸ ' : ''}{name}</span>
        <span className="puc-wd__player-label">{label}</span>
      </div>
      {clockMs !== undefined && (
        <Clock
          baseMs={clockMs}
          lastTickAt={clockRunning ? lastTickServerTs : null}
          running={clockRunning}
          className="puc-wd__player-clock"
        />
      )}
    </div>
  )
}

function humanError(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^FirebaseError: /, '')
  return String(e)
}

function computeLastTouched(
  actions: WizardRoomDoc['actions'],
): { from: Square; to: Square } | null {
  for (let i = actions.length - 1; i >= 0; i--) {
    const rec = actions[i]
    if (!rec) continue
    if (rec.kind === 'move') {
      return { from: rec.from as Square, to: rec.to as Square }
    }
    if (rec.kind === 'spell') {
      if (rec.targets.length >= 2) {
        return { from: rec.targets[0] as Square, to: rec.targets[1] as Square }
      }
      if (rec.targets.length === 1) {
        const sq = rec.targets[0] as Square
        return { from: sq, to: sq }
      }
      return null
    }
  }
  return null
}
