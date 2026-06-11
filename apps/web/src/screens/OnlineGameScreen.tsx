import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Board } from '../board/Board'

/* three.js chunk — fetched only on first 3D flip (shared with Local). */
const Board3D = lazy(() =>
  import('../board3d/Board3D').then((m) => ({ default: m.Board3D })),
)
import { CapturedPieceGlyph } from '../cosmetics/CapturedPieceGlyph'
import { findKing, piecesFromFen } from '../chess/fen'
import { ChessGame } from '../chess/game'
import type { Color, GameStatus, MoveInput, PieceSymbol, Square } from '../chess/types'
import { useAuthUid } from '../auth/useAuthUid'
import { HOSTS } from '../hosts/hosts'
import { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { PowerUpCeremony, type PowerUpData } from '../powerups/PowerUpCeremony'
import { pickPowerUpVariant } from '../powerups/powerUpVariant'
import { CrownBadge } from '../powerups/CrownBadge'
import { GameEndOverlay } from '../powerups/GameEndOverlay'
import { TacticBloom, type TacticBloomData } from '../powerups/TacticBloom'
import { PIECE_VALUE } from '../powerups/pieceValues'
import { ResignDialog } from '../powerups/ResignDialog'
import { callClaimTimeWin, callJoinRoom, callResignGame } from '../firebase/callables'
import { saveGame } from '../history/api'
import { track } from '../firebase/analytics'
import { useSound } from '../sound/useSound'
import { Clock } from '../clock/Clock'
import { ChampionCrown } from '../tournament/ChampionCrown'
import '../invitations/NameLink.css'
import { useRoom } from '../rooms/useRoom'
import type { RoomDoc } from '../rooms/types'
import { loadProfile, addCrowns } from '../storage/profile'
import { useCastle } from '../castle/useCastle'
import { useCosmetics } from '../cosmetics/useCosmetics'
import { awardPoints } from '../castle/awardPoints'
import { useResponsiveSquareSize } from '../board/useResponsiveSquareSize'
import './LocalGameScreen.css'
import './OnlineGameScreen.css'

const MAX_SQUARE_SIZE = 72

export function OnlineGameScreen() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const auth = useAuthUid()
  const { state, submitMove, retry } = useRoom(roomId ?? null)
  const [watchOnly, setWatchOnly] = useState(false)
  const { identity: castleIdentity } = useCastle()
  const myCosmetics = useCosmetics()
  // Seat-reclaim flag: true while we're calling joinRoom to swap a
  // stale playerId for the caller's current uid.
  const [reclaiming, setReclaiming] = useState(false)

  // Auto-reclaim: when the room is ready and we're not currently
  // recognised as a player, but our castle name matches one of the
  // seats, swap the seat's playerId silently. Covers the "I lost
  // connection / switched device but came back through Watch" case.
  useEffect(() => {
    if (state.status !== 'ready' || !roomId || auth.status !== 'ready') return
    if (reclaiming) return
    const room = state.room
    const uid = auth.uid
    const isAlreadyPlayer =
      room.white.playerId === uid ||
      (room.black?.playerId !== undefined && room.black.playerId === uid)
    if (isAlreadyPlayer) return
    const mine = castleIdentity?.normalizedName
    if (!mine || castleIdentity?.isBypass) return
    const matchesSeat =
      room.white.normalizedName === mine ||
      room.black?.normalizedName === mine
    if (!matchesSeat) return
    setReclaiming(true)
    void callJoinRoom({
      roomId,
      displayName: castleIdentity.displayName,
      normalizedName: mine,
      pieceSetId: myCosmetics.pieceSetId,
    })
      .then(() => retry())
      .catch((err) => {
        console.warn('seat reclaim failed:', err)
      })
      .finally(() => setReclaiming(false))
  }, [state, roomId, auth, castleIdentity, myCosmetics.pieceSetId, retry, reclaiming])

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
    // Legacy path — anonymous-auth failure or similar. Send them to the join
    // panel for a second chance.
    return <JoinPanel roomId={roomId} onJoined={retry} onBack={() => navigate('/')} />
  }

  // Ready: decide between Join, Watch, or play.
  const room = state.room
  const isPlayer =
    room.white.playerId === auth.uid ||
    (room.black?.playerId !== undefined && room.black.playerId === auth.uid)

  // Mid-reclaim status — show a small "Reconnecting" message instead
  // of flashing the spectator board.
  if (reclaiming && !isPlayer) {
    return <FullPageStatus text="Reconnecting to your seat…" />
  }

  // If the room is still waiting and you're not the creator, offer to join as
  // black. The "Watch instead" button on JoinPanel sets watchOnly so we drop
  // straight into spectator view (and re-evaluate if/when the room goes live).
  if (!isPlayer && room.status === 'waiting' && !watchOnly) {
    return (
      <JoinPanel
        roomId={roomId}
        onJoined={retry}
        onWatchInstead={() => setWatchOnly(true)}
        onBack={() => navigate('/')}
      />
    )
  }

  return (
    <RoomView
      room={room}
      roomId={roomId}
      uid={auth.uid}
      submitMove={submitMove}
      onBack={() => navigate('/')}
      onReview={() => {
        const replay = new ChessGame()
        for (const m of room.moves) {
          replay.move({
            from: m.uci.slice(0, 2) as Square,
            to: m.uci.slice(2, 4) as Square,
            ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
          })
        }
        navigate('/review', {
          state: {
            pgn: replay.pgn(),
            hostId: room.hostMode,
            whiteName: room.white.displayName,
            blackName: room.black?.displayName ?? '',
          },
        })
      }}
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
  onWatchInstead,
  onBack,
}: {
  roomId: string
  onJoined: () => void
  onWatchInstead?: () => void
  onBack: () => void
}) {
  const { identity } = useCastle()
  const cosmetics = useCosmetics()
  // Profile name is the fallback for the rare case where someone hits a
  // room URL without a castle identity (cleared cache, shared link, etc.).
  const initial = loadProfile()
  const [fallbackName, setFallbackName] = useState(initial.displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefer the castle identity — no need to ask for a name we already know.
  const displayName = identity?.displayName ?? fallbackName.trim()
  const haveIdentity = !!identity

  const onJoin = async () => {
    setBusy(true)
    setError(null)
    try {
      await callJoinRoom({
        roomId,
        displayName,
        pieceSetId: cosmetics.pieceSetId,
        ...(identity?.normalizedName ? { normalizedName: identity.normalizedName } : {}),
      })
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
        {haveIdentity ? (
          <p className="puc-online__join-asyou">
            Joining as <strong>{displayName}</strong>
          </p>
        ) : (
          <label className="puc-online__field">
            <span>Your name</span>
            <input
              type="text"
              value={fallbackName}
              onChange={(e) => setFallbackName(e.target.value)}
              maxLength={24}
              autoComplete="off"
            />
          </label>
        )}
        <div className="puc-online__join-actions">
          <button type="button" className="puc-online__btn--ghost" onClick={onBack}>Back</button>
          <button
            type="button"
            className="puc-online__btn--primary"
            disabled={busy || displayName.length === 0}
            onClick={onJoin}
          >
            {busy ? 'Joining…' : 'Join room'}
          </button>
        </div>
        {onWatchInstead && (
          <button
            type="button"
            className="puc-online__watch-link"
            onClick={onWatchInstead}
          >
            Or just watch
          </button>
        )}
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
  onReview: () => void
}

function RoomView({ room, roomId, uid, submitMove, onBack, onReview }: RoomViewProps) {
  const host = HOSTS[room.hostMode]
  const sound = useSound()
  const SQUARE_SIZE = useResponsiveSquareSize(MAX_SQUARE_SIZE)
  const { identity, setCastlePoints } = useCastle()
  // Presence ("in this chess room") is published by the App-level
  // GlobalPresenceHeartbeat, which derives the location from the URL.
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
  const positionStatus = localGame.status()
  const turn = localGame.turn()
  const inCheck = positionStatus.kind === 'in_progress' && positionStatus.inCheck

  // Resignation and flag-fall aren't visible in the position; the room doc
  // carries them. Layer them on top so the UI treats each as a real terminal
  // state instead of falling back to in_progress.
  const effectiveStatus: GameStatus = useMemo(() => {
    if (room.status === 'completed' && room.endReason === 'resign') {
      const winner: Color = room.result === 'white' ? 'w' : 'b'
      return { kind: 'resign', winner, resigner: winner === 'w' ? 'b' : 'w' }
    }
    if (
      room.status === 'completed' &&
      room.endReason === 'timeout' &&
      (room.result === 'white' || room.result === 'black')
    ) {
      const winner: Color = room.result === 'white' ? 'w' : 'b'
      return { kind: 'timeout', winner, loser: winner === 'w' ? 'b' : 'w' }
    }
    return positionStatus
  }, [room.status, room.endReason, room.result, positionStatus])

  const gameOver = effectiveStatus.kind !== 'in_progress'

  // Last move highlight from authoritative move list.
  const lastMove = room.moves.length
    ? {
        from: room.moves[room.moves.length - 1]!.uci.slice(0, 2) as Square,
        to: room.moves[room.moves.length - 1]!.uci.slice(2, 4) as Square,
      }
    : null
  const checkSquare = inCheck ? findKing(pieces, turn) : null

  const isMyTurn = yourColor === turn && room.status === 'live' && !gameOver

  const legalDestinationsFrom = useCallback(
    (from: Square) => (isMyTurn ? localGame.legalDestinationsFrom(from) : []),
    [localGame, isMyTurn],
  )

  // Resign dialog state.
  const [resignDialogOpen, setResignDialogOpen] = useState(false)
  // 3D view + fullscreen — local to this client; the opponent's view
  // is unaffected. Same renderer swap as Local Chess.
  const [view3d, setView3d] = useState(false)
  const [fs3d, setFs3d] = useState(false)
  useEffect(() => {
    if (!fs3d) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs3d(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fs3d])
  const [resignBusy, setResignBusy] = useState(false)
  const [resignError, setResignError] = useState<string | null>(null)
  const onConfirmResign = useCallback(async () => {
    setResignBusy(true)
    setResignError(null)
    try {
      await callResignGame(roomId)
      setResignDialogOpen(false)
    } catch (e) {
      setResignError(e instanceof Error ? e.message : String(e))
    } finally {
      setResignBusy(false)
    }
  }, [roomId])

  // Capture sparks driven by new captures appearing in the move list. seenRef
  // tracks how much of the move list we have already processed, so re-renders
  // do not re-spawn old sparks. Initial value = current length so a player who
  // joins mid-game doesn't see a backlog of sparks all at once.
  const [picker] = useState(() => new TemplatePicker())
  const [sparks, setSparks] = useState<CaptureSparkData[]>([])
  const [blooms, setBlooms] = useState<TacticBloomData[]>([])
  const [powerUps, setPowerUps] = useState<PowerUpData[]>([])
  const seenRef = useRef<number>(room.moves.length)

  useEffect(() => {
    const seen = seenRef.current
    if (room.moves.length <= seen) {
      seenRef.current = room.moves.length
      return
    }
    const newSparks: CaptureSparkData[] = []
    const newBlooms: TacticBloomData[] = []
    const newPowerUps: PowerUpData[] = []
    const cursor = new ChessGame()
    let sawCaptureInNew = false
    let sawNonCaptureMoveInNew = false
    let sawCheckInNew = false
    for (let i = 0; i < room.moves.length; i++) {
      const m = room.moves[i]!
      const preStatus = cursor.status()
      const wasInCheck = preStatus.kind === 'in_progress' && preStatus.inCheck
      const applied = cursor.move({
        from: m.uci.slice(0, 2) as Square,
        to: m.uci.slice(2, 4) as Square,
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
      const postStatus = cursor.status()
      const givesCheck = postStatus.kind === 'in_progress' && postStatus.inCheck
      if (i < seen) continue
      if (applied?.captured) {
        sawCaptureInNew = true
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
        newPowerUps.push({
          id: performance.now() + newPowerUps.length + 0.25,
          variant: pickPowerUpVariant(),
        })
        if (PIECE_VALUE[applied.captured] >= 3 && (wasInCheck || givesCheck)) {
          newBlooms.push({
            id: performance.now() + newBlooms.length + 0.5,
            square: captureSquare,
          })
        }
      } else if (applied) {
        sawNonCaptureMoveInNew = true
      }
      if (givesCheck) sawCheckInNew = true
    }
    seenRef.current = room.moves.length

    if (sawCaptureInNew) sound.play('capture')
    else if (sawNonCaptureMoveInNew) sound.play('move')
    if (sawCheckInNew) sound.play('check')
    // Power Up ceremony sound per fresh capture (one sound per ceremony).
    for (const p of newPowerUps) sound.play(`powerup-${p.variant}` as const)

    // This is a legitimate sync from an external system (Firestore snapshots)
    // into UI state; the lint rule's general advice doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newSparks.length) setSparks((prev) => [...prev, ...newSparks])
    if (newBlooms.length) setBlooms((prev) => [...prev, ...newBlooms])
    if (newPowerUps.length) setPowerUps((prev) => [...prev, ...newPowerUps])
  }, [room.moves, room.hostMode, picker, sound])

  const handleSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const handlePowerUpDone = useCallback((id: number) => {
    setPowerUps((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleBloomDone = useCallback((id: number) => {
    setBlooms((prev) => prev.filter((b) => b.id !== id))
  }, [])

  const [submitError, setSubmitError] = useState<string | null>(null)
  const handleMove = useCallback(
    async (move: MoveInput) => {
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`
      try {
        await submitMove(uci)
        setSubmitError(null)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // The "Move index out of sync" error is a benign race — the
        // snapshot will reconcile the board within a tick. Hiding it
        // from the kid avoids a confusing flash for what is invisibly
        // self-healing.
        if (/Move index out of sync/i.test(msg)) return
        setSubmitError(msg)
      }
    },
    [submitMove],
  )

  // Game-end recap (terminal state only).
  const endRecap = useMemo(() => {
    if (room.status !== 'completed') return ''
    const winnerName = room.result === 'white' ? room.white.displayName : room.black?.displayName ?? ''
    if (room.endReason === 'checkmate') {
      return picker.pick(room.hostMode, 'checkmate-win', { winnerName })
    }
    if (room.endReason === 'resign' || room.endReason === 'timeout') {
      // Resignation / flag-fall are decisive results, not draws. Reuse the
      // win template so the recap reads as "X wins" not "It is a draw".
      return picker.pick(room.hostMode, 'checkmate-win', { winnerName })
    }
    if (room.endReason === 'stalemate') return picker.pick(room.hostMode, 'stalemate')
    return picker.pick(room.hostMode, 'draw')
  }, [room.status, room.endReason, room.hostMode, room.result, room.white.displayName, room.black?.displayName, picker])

  const orientation: Color = yourColor ?? 'w'

  // Auto-claim a time-out win when the opponent's clock should have flagged.
  // We are conservative: only fire if you're a player AND it's the opponent's
  // turn AND their clock is mathematically expired. Server validates the
  // claim; if we fire too early it just throws and the next tick retries.
  useEffect(() => {
    if (!yourColor) return
    if (!room.timeControl || room.lastTickServerTs === null) return
    if (room.status !== 'live') return
    const opponentTurn = (turn === 'w' && yourColor === 'b') || (turn === 'b' && yourColor === 'w')
    if (!opponentTurn) return

    const opponentTime = turn === 'w' ? (room.whiteTimeMs ?? 0) : (room.blackTimeMs ?? 0)
    const fireAt = room.lastTickServerTs + opponentTime
    const delay = fireAt - Date.now()

    let cancelled = false
    const claim = () => {
      if (cancelled) return
      callClaimTimeWin(roomId).catch(() => {
        // Either the server says they haven't flagged yet (clock skew — retry
        // on next room update) or the game already ended. Either way: ignore.
      })
    }
    if (delay <= 0) {
      claim()
      return () => {
        cancelled = true
      }
    }
    const timerId = window.setTimeout(claim, delay + 100) // +100ms safety margin
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [yourColor, room.timeControl, room.lastTickServerTs, room.status, room.whiteTimeMs, room.blackTimeMs, turn, roomId])

  // Fanfare when the room flips to completed.
  useEffect(() => {
    if (room.status !== 'completed') return
    if (yourColor && room.result && room.result !== 'draw') {
      const youWon = (room.result === 'white' && yourColor === 'w') ||
                     (room.result === 'black' && yourColor === 'b')
      sound.play(youWon ? 'mate-win' : 'mate-loss')
      if (youWon) {
        addCrowns(1)
        void awardPoints(identity, { source: 'chess-win', gameId: roomId, opponent: 'human' }).then((res) => {
          if (res) setCastlePoints(res.castlePoints)
        })
      }
    } else if (!yourColor && room.result && room.result !== 'draw') {
      // Spectator — gentle fanfare regardless of who won.
      sound.play('mate-win')
    } else {
      sound.play('draw')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.status, room.result])

  // Persist completed online games to local IndexedDB — but only for actual
  // players. Spectators don't fill their own history with random games.
  // Idempotent: id is online:ROOMID, and IDB's put() upserts on that key.
  const [savedThisGame, setSavedThisGame] = useState(false)
  useEffect(() => {
    if (savedThisGame) return
    if (room.status !== 'completed') return
    if (!yourColor) return
    const replay = new ChessGame()
    for (const m of room.moves) {
      replay.move({
        from: m.uci.slice(0, 2) as Square,
        to: m.uci.slice(2, 4) as Square,
        ...(m.uci.length === 5 ? { promotion: m.uci[4] as 'q' | 'r' | 'b' | 'n' } : {}),
      })
    }
    track('game_end', {
      mode: 'online',
      result: room.result ?? 'draw',
      end_reason: room.endReason ?? 'other',
      move_count: room.moves.length,
      time_control: room.timeControl ? `${room.timeControl.initialMs}+${room.timeControl.incrementMs}` : 'untimed',
    })
    saveGame({
      id: `online:${roomId}`,
      playedAt: room.updatedAt,
      mode: 'online',
      whiteName: room.white.displayName,
      blackName: room.black?.displayName ?? '',
      hostId: room.hostMode,
      result: room.result ?? 'draw',
      endReason: room.endReason ?? 'other',
      pgn: replay.pgn(),
      finalFen: room.currentFen,
      moveCount: room.moves.length,
    }).catch((err) => {
      console.warn('[history] failed to save online game', err)
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedThisGame(true)
  }, [room, roomId, savedThisGame, yourColor])

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

  const statusForBanner: GameStatus = effectiveStatus

  return (
    <div className="puc-local">
      <header className="puc-local__header">
        <button type="button" className="puc-local__exit" onClick={onBack} aria-label="Back to menu">
          ←
        </button>
        <div className="puc-local__host">
          <span className="puc-local__host-name">{host.name}</span>
          <span className="puc-local__host-blurb">is your host today</span>
          {!yourColor && <span className="puc-online__spectator-chip">Spectating</span>}
        </div>
        <div className="puc-local__actions">
          {yourColor && <CrownBadge variant="inline" watch={room.status} />}
          <button
            type="button"
            className={'puc-local__face-toggle' + (view3d ? ' puc-local__face-toggle--on' : '')}
            onClick={() => { setView3d((v) => !v); setFs3d(false) }}
            aria-pressed={view3d}
            title={view3d ? 'Back to the flat board' : 'Switch to the 3D board'}
          >
            {view3d ? '🎲 2D' : '🎲 3D'}
          </button>
          {view3d && (
            <button type="button" onClick={() => setFs3d(true)} title="Fullscreen 3D board">
              ⛶
            </button>
          )}
          {yourColor && room.status === 'live' && (
            <button type="button" onClick={() => setResignDialogOpen(true)}>
              Resign
            </button>
          )}
          <button type="button" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </header>

      <div className="puc-local__main">
        <aside className="puc-local__side puc-local__side--top">
          <OpponentCard
            name={orientation === 'w' ? room.black?.displayName ?? 'Waiting…' : room.white.displayName}
            normalizedName={orientation === 'w' ? room.black?.normalizedName ?? null : room.white.normalizedName ?? null}
            color={orientation === 'w' ? 'b' : 'w'}
            isTurn={room.status === 'live' && (orientation === 'w' ? turn === 'b' : turn === 'w')}
            captured={orientation === 'w' ? lostByWhite : lostByBlack}
            capturedColor={orientation === 'w' ? 'w' : 'b'}
            waiting={!room.black && orientation === 'w'}
            clockMs={room.timeControl ? (orientation === 'w' ? room.blackTimeMs : room.whiteTimeMs) : null}
            clockRunning={
              room.status === 'live' &&
              (orientation === 'w' ? turn === 'b' : turn === 'w')
            }
            clockTickAt={room.lastTickServerTs}
          />
        </aside>

        <div className="puc-local__board-wrap">
          <div
            className={'puc-local__board-stage' + (view3d ? ' puc-local__board-stage--3d' : '')}
            style={view3d ? undefined : { width: SQUARE_SIZE * 8, height: SQUARE_SIZE * 8 }}
          >
            {view3d ? (
              fs3d ? (
                <div className="puc-local__board3d-loading">
                  Playing fullscreen — press ESC or ✕ to return.
                </div>
              ) : (
                <Suspense
                  fallback={<div className="puc-local__board3d-loading">Carving the 3D board…</div>}
                >
                  <Board3D
                    pieces={pieces}
                    turn={turn}
                    legalDestinationsFrom={legalDestinationsFrom}
                    onMove={handleMove}
                    lastMove={lastMove}
                    checkSquare={checkSquare}
                    initialSide={orientation}
                  />
                </Suspense>
              )
            ) : (
              <Board
                pieces={pieces}
                turn={isMyTurn ? turn : 'w' as Color /* turn doesn't matter; isMyTurn gates dragging via legalDestinations */}
                orientation={orientation}
                legalDestinationsFrom={legalDestinationsFrom}
                onMove={handleMove}
                lastMove={lastMove}
                checkSquare={checkSquare}
                squareSize={SQUARE_SIZE}
                whitePieceSetId={room.white.pieceSetId}
                blackPieceSetId={room.black?.pieceSetId}
              />
            )}
            {!view3d && sparks.map((s) => (
              <CaptureSpark
                key={s.id}
                data={s}
                squareSize={SQUARE_SIZE}
                orientation={orientation}
                onDone={handleSparkDone}
              />
            ))}
            {!view3d && blooms.map((b) => (
              <TacticBloom
                key={b.id}
                data={b}
                squareSize={SQUARE_SIZE}
                orientation={orientation}
                onDone={handleBloomDone}
              />
            ))}
            {powerUps.map((p) => (
              <PowerUpCeremony key={p.id} data={p} onDone={handlePowerUpDone} />
            ))}
          </div>
          <RoomStatusLine
            room={room}
            isMyTurn={isMyTurn}
            youAreSpectator={!yourColor}
            inCheck={inCheck}
            turn={turn}
          />
          {submitError && <p className="puc-online__error">{submitError}</p>}
        </div>

        <aside className="puc-local__side puc-local__side--bottom">
          <OpponentCard
            name={orientation === 'w' ? room.white.displayName : room.black?.displayName ?? '—'}
            normalizedName={orientation === 'w' ? room.white.normalizedName ?? null : room.black?.normalizedName ?? null}
            color={orientation === 'w' ? 'w' : 'b'}
            isTurn={room.status === 'live' && (orientation === 'w' ? turn === 'w' : turn === 'b')}
            captured={orientation === 'w' ? lostByBlack : lostByWhite}
            capturedColor={orientation === 'w' ? 'b' : 'w'}
            isYou={!!yourColor}
            clockMs={room.timeControl ? (orientation === 'w' ? room.whiteTimeMs : room.blackTimeMs) : null}
            clockRunning={
              room.status === 'live' &&
              (orientation === 'w' ? turn === 'w' : turn === 'b')
            }
            clockTickAt={room.lastTickServerTs}
          />
        </aside>

        <aside className="puc-local__moves" aria-label="Move list">
          <h3 className="puc-local__moves-title">Moves</h3>
          <OnlineMoveList moves={room.moves} />
        </aside>
      </div>

      {view3d && fs3d && (
        <div className="puc-local__fs3d">
          <Suspense
            fallback={<div className="puc-local__board3d-loading">Carving the 3D board…</div>}
          >
            <Board3D
              pieces={pieces}
              turn={turn}
              legalDestinationsFrom={legalDestinationsFrom}
              onMove={handleMove}
              lastMove={lastMove}
              checkSquare={checkSquare}
              initialSide={orientation}
            />
          </Suspense>
          {/* Top chip = the far side from the viewer's orientation. */}
          <div
            className={
              'puc-local__fs3d-chip puc-local__fs3d-chip--top' +
              (room.status === 'live' && turn !== orientation ? ' puc-local__fs3d-chip--active' : '')
            }
          >
            <span
              className={`puc-player__dot puc-player__dot--${orientation === 'w' ? 'b' : 'w'}`}
              aria-hidden="true"
            />
            <span>
              {orientation === 'w'
                ? room.black?.displayName ?? 'Waiting…'
                : room.white.displayName}
            </span>
            {room.timeControl && (
              <Clock
                baseMs={orientation === 'w' ? room.blackTimeMs ?? 0 : room.whiteTimeMs ?? 0}
                lastTickAt={room.lastTickServerTs}
                running={room.status === 'live' && turn !== orientation}
              />
            )}
          </div>
          <div
            className={
              'puc-local__fs3d-chip puc-local__fs3d-chip--bottom' +
              (room.status === 'live' && turn === orientation ? ' puc-local__fs3d-chip--active' : '')
            }
          >
            <span
              className={`puc-player__dot puc-player__dot--${orientation}`}
              aria-hidden="true"
            />
            <span>
              {orientation === 'w'
                ? room.white.displayName
                : room.black?.displayName ?? '—'}
            </span>
            {room.timeControl && (
              <Clock
                baseMs={orientation === 'w' ? room.whiteTimeMs ?? 0 : room.blackTimeMs ?? 0}
                lastTickAt={room.lastTickServerTs}
                running={room.status === 'live' && turn === orientation}
              />
            )}
          </div>
          <button
            type="button"
            className="puc-local__fs3d-exit"
            onClick={() => setFs3d(false)}
            aria-label="Exit fullscreen"
            title="Exit fullscreen (ESC)"
          >
            ✕
          </button>
        </div>
      )}

      <GameEndOverlay
        status={statusForBanner}
        whiteName={room.white.displayName}
        blackName={room.black?.displayName ?? ''}
        hostRecap={endRecap}
        hostId={room.hostMode}
        viewerColor={yourColor ?? undefined}
        onNewGame={onBack}
        onBackToMenu={onBack}
        onReview={onReview}
      />

      {resignDialogOpen && yourColor && (
        <ResignDialog
          mode="online"
          yourName={yourColor === 'w' ? room.white.displayName : room.black?.displayName ?? ''}
          busy={resignBusy}
          onResign={onConfirmResign}
          onCancel={() => {
            setResignDialogOpen(false)
            setResignError(null)
          }}
        />
      )}
      {resignError && <p className="puc-online__error puc-online__error--floating">{resignError}</p>}
    </div>
  )
}

function OpponentCard({
  name,
  normalizedName,
  color,
  isTurn,
  captured,
  capturedColor,
  waiting,
  isYou,
  clockMs,
  clockRunning,
  clockTickAt,
}: {
  name: string
  normalizedName?: string | null
  color: Color
  isTurn: boolean
  captured: PieceSymbol[]
  capturedColor: Color
  waiting?: boolean
  isYou?: boolean
  clockMs: number | null
  clockRunning: boolean
  clockTickAt: number | null
}) {
  return (
    <div className={`puc-player ${isTurn ? 'puc-player--active' : ''}`}>
      <span className={`puc-player__dot puc-player__dot--${color}`} aria-hidden="true" />
      <span className="puc-player__name">
        {name}
        <ChampionCrown normalizedName={normalizedName} />
        {isYou ? ' (you)' : ''}{waiting ? ' (waiting for opponent…)' : ''}
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
  turn,
}: {
  room: RoomDoc
  isMyTurn: boolean
  youAreSpectator: boolean
  inCheck: boolean
  turn: Color
}) {
  if (room.status === 'waiting') {
    if (youAreSpectator) {
      return <p className="puc-local__status">Waiting for the game to start…</p>
    }
    return <p className="puc-local__status">Waiting for an opponent to join. Share the link.</p>
  }
  if (room.status === 'completed') {
    const winnerName = room.result === 'white' ? room.white.displayName : room.black?.displayName ?? ''
    const loserName = room.result === 'white' ? room.black?.displayName ?? '' : room.white.displayName
    if (room.endReason === 'checkmate') {
      return <p className="puc-local__status puc-local__status--end">Checkmate — {winnerName} wins.</p>
    }
    if (room.endReason === 'resign') {
      return <p className="puc-local__status puc-local__status--end">{loserName} resigned — {winnerName} wins.</p>
    }
    if (room.endReason === 'stalemate') return <p className="puc-local__status puc-local__status--end">Stalemate.</p>
    return <p className="puc-local__status puc-local__status--end">Draw.</p>
  }
  if (youAreSpectator) {
    const toMoveName = turn === 'w' ? room.white.displayName : room.black?.displayName ?? ''
    return (
      <p className="puc-local__status">
        Watching · {toMoveName} to move{inCheck ? ' — in check' : ''}.
      </p>
    )
  }
  return (
    <p className="puc-local__status">
      {isMyTurn ? 'Your turn' : 'Opponent thinking…'}{inCheck && isMyTurn ? ' — in check' : ''}
    </p>
  )
}
