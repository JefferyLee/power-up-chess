import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'
import { PIECE_GLYPH } from '../board/pieceGlyphs'
import { findKing, piecesFromFen } from '../chess/fen'
import { ChessGame } from '../chess/game'
import type { Color, MoveInput, PieceSymbol, Square } from '../chess/types'
import { useAuthUid } from '../auth/useAuthUid'
import { HOSTS } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import { callJoinRoom } from '../firebase/callables'
import { useRoom } from '../rooms/useRoom'
import type { RoomDoc } from '../rooms/types'
import { loadProfile } from '../storage/profile'
import './LocalGameScreen.css'
import './OnlineGameScreen.css'

const SQUARE_SIZE = 72

export function OnlineGameScreen() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const auth = useAuthUid()
  const { state, submitMove } = useRoom(roomId ?? null)

  if (auth.status === 'loading') {
    return <FullPageStatus text="Signing you in…" />
  }
  if (auth.status === 'error') {
    return <FullPageStatus text={`Auth error: ${auth.error.message}`} />
  }

  if (!roomId) {
    return <FullPageStatus text="Missing room id." onBack={() => navigate('/')} />
  }

  if (state.status === 'loading') return <FullPageStatus text="Loading room…" onBack={() => navigate('/')} />
  if (state.status === 'not_found') {
    return <FullPageStatus text={`Room "${roomId}" was not found.`} onBack={() => navigate('/')} />
  }
  if (state.status === 'error') {
    return <FullPageStatus text={`Error: ${state.error.message}`} onBack={() => navigate('/')} />
  }
  if (state.status === 'forbidden') {
    return <JoinPanel roomId={roomId} onJoined={() => { /* listener will re-fire as ready */ }} onBack={() => navigate('/')} />
  }

  return (
    <RoomView
      room={state.room}
      roomId={roomId}
      uid={auth.uid}
      submitMove={submitMove}
      onBack={() => navigate('/')}
    />
  )
}

function FullPageStatus({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <div className="puc-online__status">
      <p>{text}</p>
      {onBack && (
        <button type="button" className="puc-online__back" onClick={onBack}>
          Back to menu
        </button>
      )}
    </div>
  )
}

function JoinPanel({
  roomId,
  onJoined,
  onBack,
}: {
  roomId: string
  onJoined: () => void
  onBack: () => void
}) {
  const initial = loadProfile()
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onJoin = async () => {
    setBusy(true)
    setError(null)
    try {
      await callJoinRoom({ roomId, displayName: displayName.trim() })
      onJoined()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="puc-online__status">
      <div className="puc-online__join-card">
        <h2>Join private room</h2>
        <p className="puc-online__room-code">{roomId}</p>
        <label className="puc-online__field">
          <span>Your name</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={24}
            autoComplete="off"
          />
        </label>
        <div className="puc-online__join-actions">
          <button type="button" className="puc-online__btn--ghost" onClick={onBack}>Back</button>
          <button
            type="button"
            className="puc-online__btn--primary"
            disabled={busy || displayName.trim().length === 0}
            onClick={onJoin}
          >
            {busy ? 'Joining…' : 'Join room'}
          </button>
        </div>
        {error && <p className="puc-online__error">{error}</p>}
      </div>
    </div>
  )
}

interface RoomViewProps {
  room: RoomDoc
  roomId: string
  uid: string
  submitMove: (uci: string) => Promise<void>
  onBack: () => void
}

function RoomView({ room, roomId, uid, submitMove, onBack }: RoomViewProps) {
  const host = HOSTS[room.hostMode]
  const youAreWhite = room.white.playerId === uid
  const youAreBlack = room.black?.playerId === uid
  const yourColor: Color | null = youAreWhite ? 'w' : youAreBlack ? 'b' : null

  // Reconstruct a ChessGame from authoritative move list so legalDestinationsFrom works.
  const localGame = useMemo(() => {
    const g = new ChessGame()
    for (const m of room.moves) {
      g.move({
        from: m.uci.slice(0, 2) as Square,
        to: m.uci.slice(2, 4) as Square,
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
    }
    return g
  }, [room.moves])

  const pieces = useMemo(() => piecesFromFen(room.currentFen), [room.currentFen])
  const status = localGame.status()
  const turn = localGame.turn()
  const inCheck = status.kind === 'in_progress' && status.inCheck

  // Last move highlight from authoritative move list.
  const lastMove = room.moves.length
    ? {
        from: room.moves[room.moves.length - 1]!.uci.slice(0, 2) as Square,
        to: room.moves[room.moves.length - 1]!.uci.slice(2, 4) as Square,
      }
    : null
  const checkSquare = inCheck ? findKing(pieces, turn) : null

  const isMyTurn = yourColor === turn && room.status === 'live'

  const legalDestinationsFrom = useCallback(
    (from: Square) => (isMyTurn ? localGame.legalDestinationsFrom(from) : []),
    [localGame, isMyTurn],
  )

  // Capture sparks driven by new captures appearing in the move list. seenRef
  // tracks how much of the move list we have already processed, so re-renders
  // do not re-spawn old sparks. Initial value = current length so a player who
  // joins mid-game doesn't see a backlog of sparks all at once.
  const [picker] = useState(() => new TemplatePicker())
  const [sparks, setSparks] = useState<CaptureSparkData[]>([])
  const seenRef = useRef<number>(room.moves.length)

  useEffect(() => {
    const seen = seenRef.current
    if (room.moves.length <= seen) {
      seenRef.current = room.moves.length
      return
    }
    const newSparks: CaptureSparkData[] = []
    const cursor = new ChessGame()
    for (let i = 0; i < room.moves.length; i++) {
      const m = room.moves[i]!
      const applied = cursor.move({
        from: m.uci.slice(0, 2) as Square,
        to: m.uci.slice(2, 4) as Square,
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
      if (i < seen) continue
      if (applied?.captured) {
        const captureSquare: Square = applied.flags.includes('e')
          ? (`${applied.to[0]}${applied.from[1]}` as Square)
          : (applied.to as Square)
        newSparks.push({
          id: performance.now() + newSparks.length,
          square: captureSquare,
          capturedPiece: applied.captured,
          capturedColor: applied.color === 'w' ? 'b' : 'w',
          text: picker.pick(room.hostMode, 'capture', { capturedPiece: applied.captured }),
        })
      }
    }
    seenRef.current = room.moves.length
    // This is a legitimate sync from an external system (Firestore snapshots)
    // into UI state; the lint rule's general advice doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newSparks.length) setSparks((prev) => [...prev, ...newSparks])
  }, [room.moves, room.hostMode, picker])

  const handleSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const [submitError, setSubmitError] = useState<string | null>(null)
  const handleMove = useCallback(
    async (move: MoveInput) => {
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`
      try {
        await submitMove(uci)
        setSubmitError(null)
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : String(e))
      }
    },
    [submitMove],
  )

  // Game-end recap (terminal state only).
  const endRecap = useMemo(() => {
    if (room.status !== 'completed') return ''
    if (room.endReason === 'checkmate') {
      const winnerName = room.result === 'white' ? room.white.displayName : room.black?.displayName ?? ''
      return picker.pick(room.hostMode, 'checkmate-win', { winnerName })
    }
    if (room.endReason === 'stalemate') return picker.pick(room.hostMode, 'stalemate')
    return picker.pick(room.hostMode, 'draw')
  }, [room.status, room.endReason, room.hostMode, room.result, room.white.displayName, room.black?.displayName, picker])

  const orientation: Color = yourColor ?? 'w'

  const [copied, setCopied] = useState(false)
  const copyLink = async () => {
    const url = `${window.location.origin}/r/${roomId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Ignore — could fall back to selecting text, but skip for MVP0.
    }
  }

  const lostByWhite: PieceSymbol[] = []
  const lostByBlack: PieceSymbol[] = []
  for (const m of room.moves) {
    // Replay-derived capture extraction would require state we already have.
    // Cheap approach: compare board diffs is overkill; instead derive captures
    // by walking the move list with a fresh ChessGame.
    void m
  }
  {
    const replay = new ChessGame()
    for (const m of room.moves) {
      const applied = replay.move({
        from: m.uci.slice(0, 2) as Square,
        to: m.uci.slice(2, 4) as Square,
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
      if (applied?.captured) {
        if (applied.color === 'w') lostByBlack.push(applied.captured)
        else lostByWhite.push(applied.captured)
      }
    }
  }

  const statusForBanner: ReturnType<ChessGame['status']> = status

  return (
    <div className="puc-local">
      <header className="puc-local__header">
        <button type="button" className="puc-local__exit" onClick={onBack} aria-label="Back to menu">
          ←
        </button>
        <div className="puc-local__host">
          <span className="puc-local__host-name">{host.name}</span>
          <span className="puc-local__host-blurb">is your host today</span>
        </div>
        <div className="puc-local__actions">
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </header>

      <div className="puc-local__main">
        <aside className="puc-local__side puc-local__side--top">
          <OpponentCard
            name={orientation === 'w' ? room.black?.displayName ?? 'Waiting…' : room.white.displayName}
            color={orientation === 'w' ? 'b' : 'w'}
            isTurn={room.status === 'live' && (orientation === 'w' ? turn === 'b' : turn === 'w')}
            captured={orientation === 'w' ? lostByWhite : lostByBlack}
            capturedColor={orientation === 'w' ? 'w' : 'b'}
            waiting={!room.black && orientation === 'w'}
          />
        </aside>

        <div className="puc-local__board-wrap">
          <div className="puc-local__board-stage" style={{ width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}>
            <Board
              pieces={pieces}
              turn={isMyTurn ? turn : 'w' as Color /* turn doesn't matter; isMyTurn gates dragging via legalDestinations */}
              orientation={orientation}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              squareSize={SQUARE_SIZE}
            />
            {sparks.map((s) => (
              <CaptureSpark
                key={s.id}
                data={s}
                squareSize={SQUARE_SIZE}
                orientation={orientation}
                onDone={handleSparkDone}
              />
            ))}
          </div>
          <RoomStatusLine
            room={room}
            isMyTurn={isMyTurn}
            youAreSpectator={!yourColor}
            inCheck={inCheck}
          />
          {submitError && <p className="puc-online__error">{submitError}</p>}
        </div>

        <aside className="puc-local__side puc-local__side--bottom">
          <OpponentCard
            name={orientation === 'w' ? room.white.displayName : room.black?.displayName ?? '—'}
            color={orientation === 'w' ? 'w' : 'b'}
            isTurn={room.status === 'live' && (orientation === 'w' ? turn === 'w' : turn === 'b')}
            captured={orientation === 'w' ? lostByBlack : lostByWhite}
            capturedColor={orientation === 'w' ? 'b' : 'w'}
            isYou
          />
        </aside>

        <aside className="puc-local__moves" aria-label="Move list">
          <h3 className="puc-local__moves-title">Moves</h3>
          <OnlineMoveList moves={room.moves} />
        </aside>
      </div>

      <GameEndOverlay
        status={statusForBanner}
        whiteName={room.white.displayName}
        blackName={room.black?.displayName ?? ''}
        hostRecap={endRecap}
        onNewGame={onBack}
        onBackToMenu={onBack}
      />
    </div>
  )
}

function OpponentCard({
  name,
  color,
  isTurn,
  captured,
  capturedColor,
  waiting,
  isYou,
}: {
  name: string
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
  waiting?: boolean
  isYou?: boolean
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">{name}{isYou ? ' (you)' : ''}{waiting ? ' (waiting for opponent…)' : ''}</span>
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

function OnlineMoveList({ moves }: { moves: RoomDoc['moves'] }) {
  const rows: Array<{ n: number; w?: string; b?: string }> = []
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      n: Math.floor(i / 2) + 1,
      w: moves[i]?.san,
      b: moves[i + 1]?.san,
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

function RoomStatusLine({
  room,
  isMyTurn,
  youAreSpectator,
  inCheck,
}: {
  room: RoomDoc
  isMyTurn: boolean
  youAreSpectator: boolean
  inCheck: boolean
}) {
  if (room.status === 'waiting') {
    return <p className="puc-local__status">Waiting for an opponent to join. Share the link.</p>
  }
  if (room.status === 'completed') {
    if (room.endReason === 'checkmate') {
      const winner = room.result === 'white' ? room.white.displayName : room.black?.displayName ?? ''
      return <p className="puc-local__status puc-local__status--end">Checkmate — {winner} wins.</p>
    }
    if (room.endReason === 'stalemate') return <p className="puc-local__status puc-local__status--end">Stalemate.</p>
    return <p className="puc-local__status puc-local__status--end">Draw.</p>
  }
  if (youAreSpectator) {
    return <p className="puc-local__status">Spectating.</p>
  }
  return (
    <p className="puc-local__status">
      {isMyTurn ? 'Your turn' : 'Opponent thinking…'}{inCheck && isMyTurn ? ' — in check' : ''}
    </p>
  )
}
