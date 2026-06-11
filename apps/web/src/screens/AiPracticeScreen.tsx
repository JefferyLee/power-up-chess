import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import { CapturedPieceGlyph } from '../cosmetics/CapturedPieceGlyph'
import type { Color, GameStatus, MoveInput, PieceSymbol, Square } from '../chess/types'
import { saveGame } from '../history/api'
import { track } from '../firebase/analytics'
import { resultPartsFromStatus } from '../history/fromStatus'
import { addCrowns, loadProfile, saveProfile } from '../storage/profile'
import { useCastle } from '../castle/useCastle'
import { awardPoints } from '../castle/awardPoints'
import { hostsLabel, type HostId } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { PowerUpCeremony, type PowerUpData } from '../powerups/PowerUpCeremony'
import { pickPowerUpVariant } from '../powerups/powerUpVariant'
import { CrownBadge } from '../powerups/CrownBadge'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import { TacticBloom, type TacticBloomData } from '../powerups/TacticBloom'
import { PIECE_VALUE } from '../powerups/pieceValues'
import { ResignDialog } from '../powerups/ResignDialog'
import { useSound } from '../sound/useSound'
import { AiOpponent } from '../ai/AiOpponent'
import { difficultyById, DIFFICULTY_PRESETS, type DifficultyId } from '../ai/difficulty'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { Clock } from '../clock/Clock'
import type { TimeControl } from '../clock/timeControl'
import './LocalGameScreen.css'
import './AiPracticeScreen.css'

const MAX_SQUARE_SIZE = 72

interface Props {
  hostId: HostId
  /** Optional second host — when set, Both mode is on: the two hosts
   *  alternate as the speaker for capture sparks. */
  coHostId?: HostId
  playerName: string
  difficultyId: DifficultyId
  /** Optional clock. null = untimed (no Clock component renders). */
  timeControl?: TimeControl | null
  onExit: () => void
}

interface ClockState {
  whiteMs: number
  blackMs: number
  /** Date.now() when the running side's clock started ticking. Null
   *  when the game is over (or untimed). */
  lastTickAt: number | null
  /** Which side's clock is currently running. */
  running: Color | null
}

function initialClockState(timeControl: TimeControl | null | undefined): ClockState {
  if (!timeControl) {
    return { whiteMs: 0, blackMs: 0, lastTickAt: null, running: null }
  }
  return {
    whiteMs: timeControl.initialMs,
    blackMs: timeControl.initialMs,
    // White's clock starts ticking the moment the game opens.
    lastTickAt: Date.now(),
    running: 'w',
  }
}

function newAiGameId(): string {
  return `ai:${crypto.randomUUID()}`
}

interface GameSnapshot {
  fen: string
  turn: Color
  inCheck: boolean
  history: ReadonlyArray<{ san: string; from: Square; to: Square; captured?: PieceSymbol; color: Color }>
  status: ReturnType<ChessGame['status']>
}

function snapshot(g: ChessGame): GameSnapshot {
  const st = g.status()
  return {
    fen: g.fen(),
    turn: g.turn(),
    inCheck: st.kind === 'in_progress' && st.inCheck,
    history: g.history().map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      captured: m.captured,
      color: m.color,
    })),
    status: st,
  }
}

export function AiPracticeScreen({ hostId, coHostId, playerName, difficultyId, timeControl, onExit }: Props) {
  const navigate = useNavigate()
  const { identity, setCastlePoints } = useCastle()
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  // Difficulty is local state so the player can switch mid-screen
  // (next game uses the new setting). Prop is just the initial value.
  const [activeDifficultyId, setActiveDifficultyId] = useState<DifficultyId>(difficultyId)
  const preset = difficultyById(activeDifficultyId)
  // For MVP1, player always plays white; AI always plays black. Colour choice
  // lands later if Ada asks for it.
  const playerColor: Color = 'w'
  const aiColor: Color = 'b'
  const whiteName = playerName
  const blackName = `AI · ${preset.label}`

  const [game, setGame] = useState(() => new ChessGame())
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(game))
  const [picker] = useState(() => new TemplatePicker())
  const [sparks, setSparks] = useState<CaptureSparkData[]>([])
  const [blooms, setBlooms] = useState<TacticBloomData[]>([])
  const [powerUps, setPowerUps] = useState<PowerUpData[]>([])
  const [resignation, setResignation] = useState<{ resigner: Color } | null>(null)
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  const [gameId, setGameId] = useState(() => newAiGameId())
  const [savedThisGame, setSavedThisGame] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)
  const [clocks, setClocks] = useState<ClockState>(() => initialClockState(timeControl ?? null))
  const [timeoutLoser, setTimeoutLoser] = useState<Color | null>(null)

  // Boot one AiOpponent for the lifetime of the screen. We terminate it on
  // unmount; the post-game review screen spins up its own analysis engine.
  const [opponent] = useState(() => new AiOpponent())
  useEffect(() => () => opponent.terminate(), [opponent])

  const effectiveStatus: GameStatus = useMemo(() => {
    if (timeoutLoser) {
      return {
        kind: 'timeout' as const,
        loser: timeoutLoser,
        winner: timeoutLoser === 'w' ? ('b' as const) : ('w' as const),
      }
    }
    if (resignation) {
      return {
        kind: 'resign' as const,
        resigner: resignation.resigner,
        winner: resignation.resigner === 'w' ? ('b' as const) : ('w' as const),
      }
    }
    return snap.status
  }, [timeoutLoser, resignation, snap.status])
  const gameOver = effectiveStatus.kind !== 'in_progress'

  const pieces = useMemo(() => piecesFromFen(snap.fen), [snap.fen])

  // Board input is only legal on the player's turn — AI moves arrive through
  // the engine, not the Board.
  const legalDestinationsFrom = useCallback(
    (from: Square) => (snap.turn === playerColor && !gameOver ? game.legalDestinationsFrom(from) : []),
    [game, snap.turn, gameOver, playerColor],
  )

  const applyMove = useCallback(
    (move: MoveInput): boolean => {
      const preStatus = game.status()
      const wasInCheck = preStatus.kind === 'in_progress' && preStatus.inCheck
      const result = game.move(move)
      if (!result) return false
      setSnap(snapshot(game))

      const newStatus = game.status()
      if (result.captured) sound.play('capture')
      else sound.play('move')
      if (newStatus.kind === 'in_progress' && newStatus.inCheck) sound.play('check')

      // Advance the clock just like LocalGameScreen — applyMove runs for
      // both the player and the AI, so this single block covers both.
      if (timeControl) {
        setClocks((c) => {
          if (!c.running || c.lastTickAt === null) return c
          const now = Date.now()
          const elapsed = now - c.lastTickAt
          const movedColor = result.color
          const movedBefore = movedColor === 'w' ? c.whiteMs : c.blackMs
          const movedAfter = Math.max(0, movedBefore - elapsed) + timeControl.incrementMs
          const nextRunning: Color = movedColor === 'w' ? 'b' : 'w'
          return {
            whiteMs: movedColor === 'w' ? movedAfter : c.whiteMs,
            blackMs: movedColor === 'b' ? movedAfter : c.blackMs,
            lastTickAt: now,
            running: nextRunning,
          }
        })
      }

      if (result.captured) {
        const captureSquare: Square = result.flags.includes('e')
          ? (`${result.to[0]}${result.from[1]}` as Square)
          : result.to
        const capturesSoFar = game.history().filter((m) => m.captured).length
        const speakingHost = coHostId && capturesSoFar % 2 === 1 ? coHostId : hostId
        const text = picker.pick(speakingHost, 'capture', { capturedPiece: result.captured })
        setSparks((prev) => [...prev, {
          id: performance.now(),
          square: captureSquare,
          capturedPiece: result.captured!,
          capturedColor: result.color === 'w' ? 'b' : 'w',
          text,
        }])

        const variant = pickPowerUpVariant()
        sound.play(`powerup-${variant}` as const)
        setPowerUps((prev) => [...prev, { id: performance.now() + 0.25, variant }])

        const givesCheck = newStatus.kind === 'in_progress' && newStatus.inCheck
        if (PIECE_VALUE[result.captured] >= 3 && (wasInCheck || givesCheck)) {
          setBlooms((prev) => [...prev, {
            id: performance.now() + 0.5,
            square: captureSquare,
          }])
        }
      }
      return true
    },
    [game, hostId, coHostId, picker, sound, timeControl],
  )

  const handleBloomDone = useCallback((id: number) => {
    setBlooms((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const handleUserMove = useCallback(
    (move: MoveInput) => {
      if (snap.turn !== playerColor || gameOver) return
      applyMove(move)
    },
    [applyMove, snap.turn, gameOver, playerColor],
  )

  // Drive the AI: whenever it's the AI's turn and the game isn't over,
  // ask the engine and apply its reply.
  useEffect(() => {
    if (gameOver) return
    if (snap.turn !== aiColor) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAiThinking(true)
    opponent
      .pickMove(snap.fen, preset.settings)
      .then((uci) => {
        if (cancelled) return
        setAiThinking(false)
        const move: MoveInput = {
          from: uci.slice(0, 2) as Square,
          to: uci.slice(2, 4) as Square,
          promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
        }
        applyMove(move)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAiThinking(false)
        setEngineError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [snap.turn, snap.fen, gameOver, aiColor, opponent, preset.settings, applyMove])

  // Flag-fall detector — same shape as LocalGameScreen. When the
  // running side's displayed time hits 0, record the timeout; the
  // effectiveStatus memo then resolves to 'timeout' and freezes things.
  useEffect(() => {
    if (!timeControl || timeoutLoser || gameOver) return
    if (!clocks.running || clocks.lastTickAt === null) return
    const running = clocks.running
    const base = running === 'w' ? clocks.whiteMs : clocks.blackMs
    const fire = () => {
      const remaining = base - (Date.now() - clocks.lastTickAt!)
      if (remaining <= 0) setTimeoutLoser(running)
    }
    const wait = Math.max(50, base - (Date.now() - clocks.lastTickAt))
    const exactTimer = window.setTimeout(fire, wait)
    const safetyInterval = window.setInterval(fire, 1000)
    return () => {
      window.clearTimeout(exactTimer)
      window.clearInterval(safetyInterval)
    }
  }, [timeControl, timeoutLoser, gameOver, clocks])

  // Freeze the clock when the game ends from any non-flag path.
  useEffect(() => {
    if (effectiveStatus.kind === 'in_progress') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClocks((c) => (c.lastTickAt === null && c.running === null ? c : { ...c, lastTickAt: null, running: null }))
  }, [effectiveStatus.kind])

  const handleRestart = useCallback(() => {
    const fresh = new ChessGame()
    setGame(fresh)
    setSnap(snapshot(fresh))
    setSparks([])
    setBlooms([])
    setPowerUps([])
    setResignation(null)
    setGameId(newAiGameId())
    setSavedThisGame(false)
    setEngineError(null)
    setClocks(initialClockState(timeControl ?? null))
    setTimeoutLoser(null)
  }, [timeControl])

  const handlePickDifficulty = useCallback((id: DifficultyId) => {
    if (id === activeDifficultyId) return
    setActiveDifficultyId(id)
    const profile = loadProfile()
    saveProfile({ ...profile, aiDifficultyId: id })
    // Start a fresh game at the new strength — finishing the current game
    // against a different opponent mid-stream would be confusing.
    handleRestart()
  }, [activeDifficultyId, handleRestart])

  const handleResign = useCallback((resigner: Color) => {
    setResignation({ resigner })
    setResignDialogOpen(false)
  }, [])

  const handleSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handlePowerUpDone = useCallback((id: number) => {
    setPowerUps((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const endRecap = useMemo(() => {
    if (effectiveStatus.kind === 'in_progress') return ''
    if (
      effectiveStatus.kind === 'checkmate' ||
      effectiveStatus.kind === 'resign' ||
      effectiveStatus.kind === 'timeout'
    ) {
      const winnerName = effectiveStatus.winner === 'w' ? whiteName : blackName
      return picker.pick(hostId, 'checkmate-win', { winnerName })
    }
    if (effectiveStatus.kind === 'stalemate') return picker.pick(hostId, 'stalemate')
    return picker.pick(hostId, 'draw')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus.kind, hostId])

  // Save once when terminal.
  useEffect(() => {
    if (savedThisGame) return
    const parts = resultPartsFromStatus(effectiveStatus)
    if (!parts) return
    track('game_end', {
      mode: 'ai',
      result: parts.result,
      end_reason: parts.endReason,
      move_count: snap.history.length,
      ai_difficulty: preset.id,
    })
    saveGame({
      id: gameId,
      playedAt: Date.now(),
      mode: 'ai',
      whiteName,
      blackName,
      hostId,
      result: parts.result,
      endReason: parts.endReason,
      pgn: game.pgn(),
      finalFen: snap.fen,
      moveCount: snap.history.length,
      aiDifficulty: preset.id,
    }).catch((err) => {
      console.warn('[history] failed to save ai game', err)
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedThisGame(true)
  }, [effectiveStatus, savedThisGame, gameId, whiteName, blackName, hostId, game, snap.fen, snap.history.length, preset.id])

  useEffect(() => {
    if (effectiveStatus.kind === 'in_progress') return
    if (effectiveStatus.kind === 'checkmate' || effectiveStatus.kind === 'resign') {
      const youWon = effectiveStatus.winner === playerColor
      sound.play(youWon ? 'mate-win' : 'mate-loss')
      if (youWon) {
        addCrowns(1)
        // Tag the opponent tier so the award scales with AI strength
        // (Beginner pays 5 pt … Expert 40 pt).
        void awardPoints(identity, {
          source: 'chess-win',
          gameId,
          opponent: `ai-${preset.id}` as const,
        }).then((res) => {
          if (res) setCastlePoints(res.castlePoints)
        })
      }
    } else {
      sound.play('draw')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus.kind])

  const lastMove = snap.history.length
    ? { from: snap.history[snap.history.length - 1]!.from, to: snap.history[snap.history.length - 1]!.to }
    : null
  const checkSquare = snap.inCheck ? findKing(pieces, snap.turn) : null
  const activeName = snap.turn === playerColor ? whiteName : blackName

  const lostByWhite: PieceSymbol[] = []
  const lostByBlack: PieceSymbol[] = []
  for (const m of snap.history) {
    if (!m.captured) continue
    if (m.color === 'w') lostByBlack.push(m.captured)
    else lostByWhite.push(m.captured)
  }

  return (
    <div className="puc-local">
      <header className="puc-local__header">
        <button type="button" className="puc-local__exit" onClick={onExit} aria-label="Back to menu">
          ←
        </button>
        <div className="puc-local__host">
          <span className="puc-local__host-name">{hostsLabel(hostId, coHostId)}</span>
          <span className="puc-local__host-blurb">
            practicing vs AI · {preset.label}
          </span>
        </div>
        <div className="puc-local__actions">
          <div className="puc-local__difficulty" role="radiogroup" aria-label="AI strength">
            {DIFFICULTY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === activeDifficultyId}
                className={`puc-local__diff-chip${p.id === activeDifficultyId ? ' puc-local__diff-chip--on' : ''}`}
                onClick={() => handlePickDifficulty(p.id)}
                title={`${p.label} — ${p.blurb}`}
              >
                {p.short}
              </button>
            ))}
          </div>
          <CrownBadge variant="inline" watch={effectiveStatus.kind} />
          <button type="button" onClick={() => setResignDialogOpen(true)} disabled={gameOver}>
            Resign
          </button>
          <button type="button" onClick={handleRestart}>
            New game
          </button>
        </div>
      </header>

      <div className="puc-local__main">
        <aside className="puc-local__side puc-local__side--top">
          <PlayerCard
            name={blackName}
            color="b"
            isTurn={snap.turn === 'b' && !gameOver}
            captured={lostByWhite}
            capturedColor="w"
            thinking={aiThinking}
            clockMs={timeControl ? clocks.blackMs : null}
            clockRunning={clocks.running === 'b'}
            clockTickAt={clocks.lastTickAt}
          />
        </aside>

        <div className="puc-local__board-wrap">
          <div className="puc-local__board-stage" style={{ width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}>
            <Board
              pieces={pieces}
              turn={snap.turn}
              orientation={playerColor}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleUserMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              squareSize={SQUARE_SIZE}
            />
            {sparks.map((s) => (
              <CaptureSpark key={s.id} data={s} squareSize={SQUARE_SIZE} onDone={handleSparkDone} />
            ))}
            {blooms.map((b) => (
              <TacticBloom key={b.id} data={b} squareSize={SQUARE_SIZE} orientation={playerColor} onDone={handleBloomDone} />
            ))}
            {powerUps.map((p) => (
              <PowerUpCeremony key={p.id} data={p} onDone={handlePowerUpDone} />
            ))}
          </div>
          <StatusBanner
            status={effectiveStatus}
            activeName={activeName}
            whiteName={whiteName}
            blackName={blackName}
            aiThinking={aiThinking}
          />
          {engineError && (
            <p className="puc-local__status puc-local__status--end">{engineError}</p>
          )}
        </div>

        <aside className="puc-local__side puc-local__side--bottom">
          <PlayerCard
            name={whiteName}
            color="w"
            isTurn={snap.turn === 'w' && !gameOver}
            captured={lostByBlack}
            capturedColor="b"
            clockMs={timeControl ? clocks.whiteMs : null}
            clockRunning={clocks.running === 'w'}
            clockTickAt={clocks.lastTickAt}
          />
        </aside>

        <aside className="puc-local__moves" aria-label="Move list">
          <h3 className="puc-local__moves-title">Moves</h3>
          <MoveList history={snap.history} />
        </aside>
      </div>

      <GameEndOverlay
        status={effectiveStatus}
        whiteName={whiteName}
        blackName={blackName}
        hostRecap={endRecap}
        hostId={hostId}
        viewerColor={playerColor}
        onNewGame={handleRestart}
        onBackToMenu={onExit}
        onReview={() =>
          navigate('/review', {
            state: { pgn: game.pgn(), hostId, whiteName, blackName },
          })
        }
      />

      {resignDialogOpen && (
        <ResignDialog
          mode="local"
          whiteName={whiteName}
          blackName={blackName}
          onResign={handleResign}
          onCancel={() => setResignDialogOpen(false)}
        />
      )}
    </div>
  )
}

function PlayerCard({
  name,
  color,
  isTurn,
  captured,
  capturedColor,
  thinking,
  clockMs,
  clockRunning,
  clockTickAt,
}: {
  name: string
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
  thinking?: boolean
  clockMs: number | null
  clockRunning: boolean
  clockTickAt: number | null
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">
        {name}
        {thinking && <span className="puc-ai__thinking" aria-label="thinking">·  ·  ·</span>}
      </span>
      {clockMs !== null && (
        <Clock baseMs={clockMs} lastTickAt={clockTickAt} running={clockRunning} />
      )}
      <span className="puc-player__captures" aria-label="Captured pieces">
        {captured.map((p, i) => (
          <span key={i} className={`puc-piece puc-piece--${capturedColor} puc-player__cap`}>
            <CapturedPieceGlyph piece={p} color={capturedColor} />
          </span>
        ))}
      </span>
    </div>
  )
}

function MoveList({ history }: { history: GameSnapshot['history'] }) {
  const rows: Array<{ n: number; w?: string; b?: string }> = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      n: Math.floor(i / 2) + 1,
      w: history[i]?.san,
      b: history[i + 1]?.san,
    })
  }
  if (rows.length === 0) return <p className="puc-local__moves-empty">No moves yet.</p>
  return (
    <ol className="puc-local__moves-list">
      {rows.map((row) => (
        <li key={row.n} className="puc-local__moves-row">
          <span className="puc-local__moves-num">{row.n}.</span>
          <span>{row.w}</span>
          <span>{row.b}</span>
        </li>
      ))}
    </ol>
  )
}

function StatusBanner({
  status,
  activeName,
  whiteName,
  blackName,
  aiThinking,
}: {
  status: GameStatus
  activeName: string
  whiteName: string
  blackName: string
  aiThinking: boolean
}) {
  if (status.kind === 'checkmate') {
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return <p className="puc-local__status puc-local__status--end">Checkmate — {winnerName} wins.</p>
  }
  if (status.kind === 'resign') {
    const resignerName = status.resigner === 'w' ? whiteName : blackName
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return <p className="puc-local__status puc-local__status--end">{resignerName} resigned — {winnerName} wins.</p>
  }
  if (status.kind === 'timeout') {
    const loserName = status.loser === 'w' ? whiteName : blackName
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return <p className="puc-local__status puc-local__status--end">{loserName} ran out of time — {winnerName} wins.</p>
  }
  if (status.kind === 'stalemate') {
    return <p className="puc-local__status puc-local__status--end">Stalemate. A quiet draw.</p>
  }
  if (status.kind === 'draw') {
    return <p className="puc-local__status puc-local__status--end">Draw ({status.reason.replace('_', ' ')}).</p>
  }
  if (status.kind === 'in_progress') {
    return (
      <p className="puc-local__status">
        {activeName} to move{status.inCheck ? ' — in check' : ''}{aiThinking ? ' — thinking…' : ''}.
      </p>
    )
  }
  return null
}
