import { useCallback, useMemo, useState } from 'react'
import { Board } from '../board/Board'
import { ChessGame } from '../chess/game'
import { findKing, piecesFromFen } from '../chess/fen'
import { PIECE_GLYPH } from '../board/pieceGlyphs'
import type { Color, MoveInput, PieceSymbol, Square } from '../chess/types'
import { HOSTS, type HostId } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import './LocalGameScreen.css'

interface Props {
  hostId: HostId
  whiteName: string
  blackName: string
  onExit: () => void
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

const SQUARE_SIZE = 72

export function LocalGameScreen({ hostId, whiteName, blackName, onExit }: Props) {
  // The ChessGame is mutable but its identity is stable across renders unless restarted.
  // Pair it with a snapshot in state so React re-renders after each move.
  const [game, setGame] = useState(() => new ChessGame())
  const [snap, setSnap] = useState<GameSnapshot>(() => snapshot(game))
  const [picker] = useState(() => new TemplatePicker())
  const [sparks, setSparks] = useState<CaptureSparkData[]>([])
  const host = HOSTS[hostId]

  const pieces = useMemo(() => piecesFromFen(snap.fen), [snap.fen])

  const legalDestinationsFrom = useCallback(
    (from: Square) => game.legalDestinationsFrom(from),
    [game],
  )

  const handleMove = useCallback(
    (move: MoveInput) => {
      const result = game.move(move)
      if (!result) return
      setSnap(snapshot(game))

      if (result.captured) {
        // En passant: the captured pawn is on the destination file + source rank,
        // not on the move's destination square.
        const captureSquare: Square = result.flags.includes('e')
          ? (`${result.to[0]}${result.from[1]}` as Square)
          : result.to
        const text = picker.pick(hostId, 'capture', { capturedPiece: result.captured })
        const spark: CaptureSparkData = {
          id: performance.now(),
          square: captureSquare,
          capturedPiece: result.captured,
          capturedColor: result.color === 'w' ? 'b' : 'w',
          text,
        }
        setSparks((prev) => [...prev, spark])
      }
    },
    [game, hostId, picker],
  )

  const handleUndo = useCallback(() => {
    if (game.undo()) setSnap(snapshot(game))
  }, [game])

  const handleRestart = useCallback(() => {
    const fresh = new ChessGame()
    setGame(fresh)
    setSnap(snapshot(fresh))
    setSparks([])
  }, [])

  const handleSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])

  // Build the game-end recap once the status is terminal. Memoised so the
  // template only fires once per terminal state (not on every render).
  const endRecap = useMemo(() => {
    if (snap.status.kind === 'in_progress') return ''
    if (snap.status.kind === 'checkmate') {
      const winnerName = snap.status.winner === 'w' ? whiteName : blackName
      return picker.pick(hostId, 'checkmate-win', { winnerName })
    }
    if (snap.status.kind === 'stalemate') {
      return picker.pick(hostId, 'stalemate')
    }
    return picker.pick(hostId, 'draw')
    // We intentionally key the memo on the status' identity so the picker is
    // invoked once per game-end. snapshot() returns a fresh status object on
    // every render, but the kind transition is what we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.status.kind, hostId])

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

  return (
    <div className="puc-local">
      <header className="puc-local__header">
        <button type="button" className="puc-local__exit" onClick={onExit} aria-label="Back to menu">
          ←
        </button>
        <div className="puc-local__host">
          <span className="puc-local__host-name">{host.name}</span>
          <span className="puc-local__host-blurb">is your host today</span>
        </div>
        <div className="puc-local__actions">
          <button type="button" onClick={handleUndo} disabled={snap.history.length === 0}>
            Undo
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
            isTurn={snap.turn === 'b' && snap.status.kind === 'in_progress'}
            captured={lostByWhite}
            capturedColor="w"
          />
        </aside>

        <div className="puc-local__board-wrap">
          <div className="puc-local__board-stage" style={{ width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}>
            <Board
              pieces={pieces}
              turn={snap.turn}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              squareSize={SQUARE_SIZE}
            />
            {sparks.map((s) => (
              <CaptureSpark key={s.id} data={s} squareSize={SQUARE_SIZE} onDone={handleSparkDone} />
            ))}
          </div>
          <StatusBanner status={snap.status} activeName={activeName} whiteName={whiteName} blackName={blackName} />
        </div>

        <aside className="puc-local__side puc-local__side--bottom">
          <PlayerCard
            name={whiteName}
            color="w"
            isTurn={snap.turn === 'w' && snap.status.kind === 'in_progress'}
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
        status={snap.status}
        whiteName={whiteName}
        blackName={blackName}
        hostRecap={endRecap}
        onNewGame={handleRestart}
        onBackToMenu={onExit}
      />
    </div>
  )
}

function PlayerCard({
  name,
  color,
  isTurn,
  captured,
  capturedColor,
}: {
  name: string
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">{name}</span>
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
  if (status.kind === 'stalemate') {
    return <p className="puc-local__status puc-local__status--end">Stalemate. A quiet draw.</p>
  }
  if (status.kind === 'draw') {
    return <p className="puc-local__status puc-local__status--end">Draw ({status.reason.replace('_', ' ')}).</p>
  }
  return (
    <p className="puc-local__status">
      {activeName} to move{status.inCheck ? ' — in check' : ''}.
    </p>
  )
}
