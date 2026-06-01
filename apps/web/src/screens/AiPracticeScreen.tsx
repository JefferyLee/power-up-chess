import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import { PIECE_GLYPH } from '../board/pieceGlyphs'
import type { Color, GameStatus, MoveInput, PieceSymbol, Square } from '../chess/types'
import { saveGame } from '../history/api'
import { resultPartsFromStatus } from '../history/fromStatus'
import { HOSTS, type HostId } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import { ResignDialog } from '../powerups/ResignDialog'
import { MuteButton } from '../sound/MuteButton'
import { useSound } from '../sound/useSound'
import { AiOpponent } from '../ai/AiOpponent'
import { difficultyById, type DifficultyId } from '../ai/difficulty'
import './LocalGameScreen.css'
import './AiPracticeScreen.css'

const SQUARE_SIZE = 72

interface Props {
  hostId: HostId
  playerName: string
  difficultyId: DifficultyId
  onExit: () => void
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

export function AiPracticeScreen({ hostId, playerName, difficultyId, onExit }: Props) {
  const navigate = useNavigate()
  const sound = useSound()
  const host = HOSTS[hostId]
  const preset = difficultyById(difficultyId)
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
  const [resignation, setResignation] = useState<{ resigner: Color } | null>(null)
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  const [gameId, setGameId] = useState(() => newAiGameId())
  const [savedThisGame, setSavedThisGame] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [engineError, setEngineError] = useState<string | null>(null)

  // Boot one AiOpponent for the lifetime of the screen. We terminate it on
  // unmount; the post-game review screen spins up its own analysis engine.
  const [opponent] = useState(() => new AiOpponent())
  useEffect(() => () => opponent.terminate(), [opponent])

  const effectiveStatus: GameStatus = useMemo(() => {
    if (resignation) {
      return {
        kind: 'resign' as const,
        resigner: resignation.resigner,
        winner: resignation.resigner === 'w' ? ('b' as const) : ('w' as const),
      }
    }
    return snap.status
  }, [resignation, snap.status])
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
      const result = game.move(move)
      if (!result) return false
      setSnap(snapshot(game))

      const newStatus = game.status()
      if (result.captured) sound.play('capture')
      else sound.play('move')
      if (newStatus.kind === 'in_progress' && newStatus.inCheck) sound.play('check')

      if (result.captured) {
        const captureSquare: Square = result.flags.includes('e')
          ? (`${result.to[0]}${result.from[1]}` as Square)
          : result.to
        const text = picker.pick(hostId, 'capture', { capturedPiece: result.captured })
        setSparks((prev) => [...prev, {
          id: performance.now(),
          square: captureSquare,
          capturedPiece: result.captured!,
          capturedColor: result.color === 'w' ? 'b' : 'w',
          text,
        }])
      }
      return true
    },
    [game, hostId, picker, sound],
  )

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

  const handleRestart = useCallback(() => {
    const fresh = new ChessGame()
    setGame(fresh)
    setSnap(snapshot(fresh))
    setSparks([])
    setResignation(null)
    setGameId(newAiGameId())
    setSavedThisGame(false)
    setEngineError(null)
  }, [])

  const handleResign = useCallback((resigner: Color) => {
    setResignation({ resigner })
    setResignDialogOpen(false)
  }, [])

  const handleSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const endRecap = useMemo(() => {
    if (effectiveStatus.kind === 'in_progress') return ''
    if (effectiveStatus.kind === 'checkmate') {
      const winnerName = effectiveStatus.winner === 'w' ? whiteName : blackName
      return picker.pick(hostId, 'checkmate-win', { winnerName })
    }
    if (effectiveStatus.kind === 'resign') {
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
          <span className="puc-local__host-name">{host.name}</span>
          <span className="puc-local__host-blurb">
            practicing vs AI · {preset.label}
          </span>
        </div>
        <div className="puc-local__actions">
          <MuteButton />
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
}: {
  name: string
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
  thinking?: boolean
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">
        {name}
        {thinking && <span className="puc-ai__thinking" aria-label="thinking">·  ·  ·</span>}
      </span>
      <span className="puc-player__captures" aria-label="Captured pieces">
        {captured.map((p, i) => (
          <span key={i} className={`puc-piece puc-piece--${capturedColor} puc-player__cap`}>
            {PIECE_GLYPH[p]}
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
