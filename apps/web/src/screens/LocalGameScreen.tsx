import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import { CapturedPieceGlyph } from '../cosmetics/CapturedPieceGlyph'
import type { Color, GameStatus, MoveInput, PieceSymbol, Square } from '../chess/types'
import { resultPartsFromStatus } from '../history/fromStatus'
import { addCrowns } from '../storage/profile'
import { useCastle } from '../castle/useCastle'
import { awardPoints } from '../castle/awardPoints'
import { hostsLabel, type HostId } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CrownBadge } from '../powerups/CrownBadge'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import { ResignDialog } from '../powerups/ResignDialog'
import { useSound } from '../sound/useSound'
import { useHostWhisper, HostWhisper } from '../hosts/HostWhisper'
import { MuteButton } from '../sound/MuteButton'
import { Clock } from '../clock/Clock'
import type { TimeControl } from '../clock/timeControl'
import { ChampionCrown } from '../tournament/ChampionCrown'
import { useBoardView } from '../gameShell/useBoardView'
import { BoardStage } from '../gameShell/BoardStage'
import { Fullscreen3D, FsChip } from '../gameShell/Fullscreen3D'
import type { StageBoardProps } from '../gameShell/boardProps'
import { useCaptureCeremony } from '../gameShell/useCaptureCeremony'
import { useTakeback } from '../gameShell/useTakeback'
import { TakebackButton } from '../gameShell/TakebackButton'
import { useSaveGame, type FinishedGame } from '../gameShell/useSaveGame'
import '../invitations/NameLink.css'
import './LocalGameScreen.css'

function newLocalGameId(): string {
  return `local:${crypto.randomUUID()}`
}

interface Props {
  hostId: HostId
  /** Optional second host — when set, Both mode is on: the two hosts
   *  alternate as the speaker for capture sparks. */
  coHostId?: HostId
  whiteName: string
  blackName: string
  timeControl: TimeControl | null
  onExit: () => void
}

interface ClockState {
  whiteMs: number
  blackMs: number
  /** Date.now() when the running side's clock started ticking. Null when the
   *  game is over (or untimed). */
  lastTickAt: number | null
  /** Which side's clock is currently running. */
  running: Color | null
}

function initialClockState(timeControl: TimeControl | null): ClockState {
  if (!timeControl) {
    return { whiteMs: 0, blackMs: 0, lastTickAt: null, running: null }
  }
  return {
    whiteMs: timeControl.initialMs,
    blackMs: timeControl.initialMs,
    // White's clock starts ticking the moment the game opens — standard
    // chess-clock convention.
    lastTickAt: Date.now(),
    running: 'w',
  }
}

interface GameSnapshot {
  fen: string
  turn: Color
  inCheck: boolean
  history: ReadonlyArray<{ san: string; from: Square; to: Square; captured?: PieceSymbol; color: Color }>
  status: ReturnType<ChessGame['status']>
}

function snapshot(g: ChessGame): GameSnapshot {
  return {
    fen: g.fen(),
    turn: g.turn(),
    inCheck: g.status().kind === 'in_progress' && (g.status() as { inCheck: boolean }).inCheck === true,
    history: g.history().map((m) => ({
      san: m.san,
      from: m.from,
      to: m.to,
      captured: m.captured,
      color: m.color,
    })),
    status: g.status(),
  }
}

const MAX_SQUARE_SIZE = 72

export function LocalGameScreen({ hostId, coHostId, whiteName, blackName, timeControl, onExit }: Props) {
  const navigate = useNavigate()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  // The ChessGame is mutable but its identity is stable across renders unless restarted.
  // Pair it with a snapshot in state so React re-renders after each move.
  const [game, setGame] = useState(() => new ChessGame())
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(game))
  const { line: whisperLine, observe } = useHostWhisper(hostId)
  const [picker] = useState(() => new TemplatePicker())
  const [localResignation, setLocalResignation] = useState<{ resigner: Color } | null>(null)
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  const [gameId, setGameId] = useState(() => newLocalGameId())
  const [clocks, setClocks] = useState<ClockState>(() => initialClockState(timeControl))
  const [timeoutLoser, setTimeoutLoser] = useState<Color | null>(null)
  // Face-to-face mode: rotate black's pieces 180° so the player sitting
  // across the table reads their pieces the same way as their opponent.
  // Pure cosmetic — board orientation and legal moves are untouched.
  // Defaults to ON since local play is almost always pass-and-play; the
  // toggle in the header flips it off for a single player using both
  // sides themselves.
  const [faceToFace, setFaceToFace] = useState(true)
  // 3D view + fullscreen — same game, alternate renderer.
  const bv = useBoardView()
  const sound = useSound()
  const { identity, setCastlePoints } = useCastle()
  const { overlays: ceremonyOverlays, onMoveApplied, reset: resetCeremony } = useCaptureCeremony({
    hostId, coHostId, picker, view3d: bv.view3d, squareSize: SQUARE_SIZE,
  })

  // Resignation isn't a chess.js concept — overlay it on top of the position-
  // derived status. Once resigned, the board freezes and the end overlay
  // appears. Memoised so the save-effect dep array doesn't re-fire every
  // render.
  const effectiveStatus: GameStatus = useMemo(() => {
    if (timeoutLoser) {
      return {
        kind: 'timeout' as const,
        loser: timeoutLoser,
        winner: timeoutLoser === 'w' ? ('b' as const) : ('w' as const),
      }
    }
    if (localResignation) {
      return {
        kind: 'resign' as const,
        resigner: localResignation.resigner,
        winner: localResignation.resigner === 'w' ? ('b' as const) : ('w' as const),
      }
    }
    return snap.status
  }, [timeoutLoser, localResignation, snap.status])
  const gameOver = effectiveStatus.kind !== 'in_progress'

  const pieces = useMemo(() => piecesFromFen(snap.fen), [snap.fen])

  const legalDestinationsFrom = useCallback(
    (from: Square) => (gameOver ? [] : game.legalDestinationsFrom(from)),
    [game, gameOver],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      const preStatus = game.status()
      const wasInCheck = preStatus.kind === 'in_progress' && preStatus.inCheck
      const result = game.move(move)
      if (!result) return
      setSnap(snapshot(game))

      const newStatus = game.status()
      const givesCheck = newStatus.kind === 'in_progress' && newStatus.inCheck
      onMoveApplied({
        result,
        wasInCheck,
        givesCheck,
        capturesSoFar: game.history().filter((m) => m.captured).length,
      })
      // Phase 2.6 — throttled host presence on notable non-capture moments.
      observe({
        san: result.san,
        captured: !!result.captured,
        promotion: result.uci.length === 5,
        givesCheck,
      })

      // Advance the clock: the moving side's elapsed comes off their clock,
      // then we add the increment, and start the opposite side's clock.
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
    },
    [game, onMoveApplied, observe, timeControl],
  )

  // Takeback ("悔棋"): a paid, 3-per-game undo. Local games revert the
  // last single ply; the signed-in account pays the escalating cost.
  const undoPly = useCallback(() => {
    if (game.undo()) setSnap(snapshot(game))
  }, [game])
  const takeback = useTakeback(!gameOver && snap.history.length > 0, undoPly)

  const handleRestart = useCallback(() => {
    const fresh = new ChessGame()
    setGame(fresh)
    setSnap(snapshot(fresh))
    resetCeremony()
    setLocalResignation(null)
    setGameId(newLocalGameId())
    setClocks(initialClockState(timeControl))
    setTimeoutLoser(null)
    takeback.reset()
  }, [timeControl, resetCeremony, takeback])

  const handleResign = useCallback((resigner: Color) => {
    setLocalResignation({ resigner })
    setResignDialogOpen(false)
  }, [])

  // Build the game-end recap once the status is terminal. Memoised so the
  // template only fires once per terminal state (not on every render).
  const endRecap = useMemo(() => {
    if (effectiveStatus.kind === 'in_progress') return ''
    if (
      effectiveStatus.kind === 'checkmate' ||
      effectiveStatus.kind === 'resign' ||
      effectiveStatus.kind === 'timeout'
    ) {
      // All three are decisive — share the win template so the recap
      // reads as "X wins" not "It is a draw".
      const winnerName = effectiveStatus.winner === 'w' ? whiteName : blackName
      return picker.pick(hostId, 'checkmate-win', { winnerName })
    }
    if (effectiveStatus.kind === 'stalemate') {
      return picker.pick(hostId, 'stalemate')
    }
    return picker.pick(hostId, 'draw')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus.kind, hostId])

  // Flag-fall detector: when the running side's displayed time hits zero,
  // record the timeout. effectiveStatus will then resolve to a 'timeout'
  // terminal kind, freezing the board and showing the end overlay.
  useEffect(() => {
    if (!timeControl || timeoutLoser || gameOver) return
    if (!clocks.running || clocks.lastTickAt === null) return
    const running = clocks.running
    const base = running === 'w' ? clocks.whiteMs : clocks.blackMs
    const fire = () => {
      const remaining = base - (Date.now() - clocks.lastTickAt!)
      if (remaining <= 0) setTimeoutLoser(running)
    }
    // Schedule once at the predicted flag-fall, but also a safety interval in
    // case the tab was backgrounded and timers drifted.
    const wait = Math.max(50, base - (Date.now() - clocks.lastTickAt))
    const exactTimer = window.setTimeout(fire, wait)
    const safetyInterval = window.setInterval(fire, 1000)
    return () => {
      window.clearTimeout(exactTimer)
      window.clearInterval(safetyInterval)
    }
  }, [timeControl, timeoutLoser, gameOver, clocks])

  // Freeze the clock when the game ends from any other path (mate / resign /
  // stalemate / draw). The early-return guard makes this a no-op once the
  // clock is already paused — no cascading renders.
  useEffect(() => {
    if (effectiveStatus.kind === 'in_progress') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClocks((c) => (c.lastTickAt === null && c.running === null ? c : { ...c, lastTickAt: null, running: null }))
  }, [effectiveStatus.kind])

  // Fanfare on terminal status change. The local resignation path doesn't
  // route through handleMove, so we trigger sounds from here for any end.
  // We also bump the Crown Spark counter on any win — local 2P shares the
  // screen, so any victory is "your" victory worth a crown.
  useEffect(() => {
    if (effectiveStatus.kind === 'in_progress') return
    if (effectiveStatus.kind === 'checkmate' || effectiveStatus.kind === 'resign') {
      sound.play('mate-win')
      addCrowns(1)
      void awardPoints(identity, { source: 'chess-win', gameId }).then((res) => {
        if (res) setCastlePoints(res.castlePoints)
      })
    } else {
      sound.play('draw')
    }
    // Fire once per terminal transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStatus.kind])

  // Persist the game once it ends (history + account archive).
  const finished = useMemo<FinishedGame | null>(() => {
    const parts = resultPartsFromStatus(effectiveStatus)
    if (!parts) return null
    return {
      record: {
        id: gameId,
        mode: 'local',
        whiteName,
        blackName,
        hostId,
        result: parts.result,
        endReason: parts.endReason,
        pgn: game.pgn(),
        finalFen: snap.fen,
        moveCount: snap.history.length,
      },
      sync: true,
    }
  }, [effectiveStatus, gameId, whiteName, blackName, hostId, game, snap.fen, snap.history.length])
  useSaveGame(finished)

  const lastMove = snap.history.length
    ? { from: snap.history[snap.history.length - 1]!.from, to: snap.history[snap.history.length - 1]!.to }
    : null

  const checkSquare = snap.inCheck ? findKing(pieces, snap.turn) : null

  const activeName = snap.turn === 'w' ? whiteName : blackName

  // Captured pieces, grouped by who lost them.
  const lostByWhite: PieceSymbol[] = []
  const lostByBlack: PieceSymbol[] = []
  for (const m of snap.history) {
    if (!m.captured) continue
    // m.color is the side that moved (and captured); the captured piece belonged to the opposite side.
    if (m.color === 'w') lostByBlack.push(m.captured)
    else lostByWhite.push(m.captured)
  }

  const boardProps: StageBoardProps = {
    pieces,
    turn: snap.turn,
    legalDestinationsFrom,
    onMove: handleMove,
    lastMove,
    checkSquare,
    flipBlackPieces: faceToFace,
    facing: faceToFace ? snap.turn : undefined,
  }

  return (
    <div className="puc-local">
      <HostWhisper hostId={hostId} line={whisperLine} />
      <header className="puc-local__header">
        <button type="button" className="puc-local__exit" onClick={onExit} aria-label="Back to menu">
          ←
        </button>
        <div className="puc-local__host">
          <span className="puc-local__host-name">{hostsLabel(hostId, coHostId)}</span>
          <span className="puc-local__host-blurb">
            {coHostId ? 'are your hosts today' : 'is your host today'}
          </span>
        </div>
        <div className="puc-local__actions">
          <MuteButton />
          <CrownBadge variant="inline" watch={effectiveStatus.kind} />
          <button
            type="button"
            className={'puc-local__face-toggle' + (bv.view3d ? ' puc-local__face-toggle--on' : '')}
            onClick={() => bv.setView3d((v) => !v)}
            aria-pressed={bv.view3d}
            title={bv.view3d ? 'Back to the flat board' : 'Switch to the 3D board'}
          >
            {bv.view3d ? '🎲 2D' : '🎲 3D'}
          </button>
          {bv.view3d && (
            <button
              type="button"
              onClick={bv.enterFs}
              title="Fullscreen 3D board"
            >
              ⛶
            </button>
          )}
          {!bv.view3d && (
            <button
              type="button"
              className={'puc-local__face-toggle' + (faceToFace ? ' puc-local__face-toggle--on' : '')}
              onClick={() => setFaceToFace((v) => !v)}
              aria-pressed={faceToFace}
              aria-label={faceToFace ? 'Face-to-face on' : 'Face-to-face off'}
              title="Rotate black's pieces 180° for face-to-face play"
            >
              <span aria-hidden="true">↕</span>
              <span className="puc-local__face-toggle-label">
                {faceToFace ? ' Face-to-face on' : ' Face-to-face'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setResignDialogOpen(true)}
            disabled={gameOver}
          >
            Resign
          </button>
          <TakebackButton takeback={takeback} readyTitle="Take back the last move" />
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
            isTurn={snap.turn === 'b' && effectiveStatus.kind === 'in_progress'}
            captured={lostByWhite}
            capturedColor="w"
            clockMs={timeControl ? clocks.blackMs : null}
            clockRunning={clocks.running === 'b'}
            clockTickAt={clocks.lastTickAt}
            normalizedName={null}
          />
        </aside>

        <div className="puc-local__board-wrap">
          <BoardStage view={bv} squareSize={SQUARE_SIZE} board={boardProps}>
            {ceremonyOverlays}
          </BoardStage>
          <StatusBanner status={effectiveStatus} activeName={activeName} whiteName={whiteName} blackName={blackName} />
        </div>

        <aside className="puc-local__side puc-local__side--bottom">
          <PlayerCard
            name={whiteName}
            color="w"
            isTurn={snap.turn === 'w' && effectiveStatus.kind === 'in_progress'}
            captured={lostByBlack}
            capturedColor="b"
            clockMs={timeControl ? clocks.whiteMs : null}
            clockRunning={clocks.running === 'w'}
            clockTickAt={clocks.lastTickAt}
            normalizedName={identity?.normalizedName ?? null}
          />
        </aside>

        <aside className="puc-local__moves" aria-label="Move list">
          <h3 className="puc-local__moves-title">Moves</h3>
          <MoveList history={snap.history} />
        </aside>
      </div>

      <Fullscreen3D view={bv} board={boardProps}>
        <FsChip side="top" color="b" active={snap.turn === 'b' && !gameOver} name={blackName}>
          {timeControl && (
            <Clock baseMs={clocks.blackMs} lastTickAt={clocks.lastTickAt} running={clocks.running === 'b'} />
          )}
        </FsChip>
        <FsChip side="bottom" color="w" active={snap.turn === 'w' && !gameOver} name={whiteName}>
          {timeControl && (
            <Clock baseMs={clocks.whiteMs} lastTickAt={clocks.lastTickAt} running={clocks.running === 'w'} />
          )}
        </FsChip>
      </Fullscreen3D>

      <GameEndOverlay
        status={effectiveStatus}
        whiteName={whiteName}
        blackName={blackName}
        hostRecap={endRecap}
        hostId={hostId}
        // viewerColor undefined → local 2P; any win triggers the ceremony.
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
  clockMs,
  clockRunning,
  clockTickAt,
  normalizedName,
}: {
  name: string
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
  clockMs: number | null
  clockRunning: boolean
  clockTickAt: number | null
  normalizedName: string | null
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">
        {name}
        <ChampionCrown normalizedName={normalizedName} />
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
  // Pair white + black into rows.
  const rows: Array<{ n: number; w?: string; b?: string }> = []
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      n: Math.floor(i / 2) + 1,
      w: history[i]?.san,
      b: history[i + 1]?.san,
    })
  }
  if (rows.length === 0) {
    return <p className="puc-local__moves-empty">No moves yet.</p>
  }
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
}: {
  status: GameSnapshot['status']
  activeName: string
  whiteName: string
  blackName: string
}) {
  if (status.kind === 'checkmate') {
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return <p className="puc-local__status puc-local__status--end">Checkmate — {winnerName} wins.</p>
  }
  if (status.kind === 'resign') {
    const resignerName = status.resigner === 'w' ? whiteName : blackName
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return (
      <p className="puc-local__status puc-local__status--end">
        {resignerName} resigned — {winnerName} wins.
      </p>
    )
  }
  if (status.kind === 'timeout') {
    const loserName = status.loser === 'w' ? whiteName : blackName
    const winnerName = status.winner === 'w' ? whiteName : blackName
    return (
      <p className="puc-local__status puc-local__status--end">
        {loserName} ran out of time — {winnerName} wins.
      </p>
    )
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
        {activeName} to move{status.inCheck ? ' — in check' : ''}.
      </p>
    )
  }
  return null
}
