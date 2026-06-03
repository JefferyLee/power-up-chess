// Wizard Duel V2 — M0 concept verification.
//
// Read-only Phaser scene rendered alongside the existing /wizard/:roomId
// route (which stays as the playable surface for now). This route is for
// testing the canvas-driven board look + move/capture animations on top of
// real Firestore room state. To play, open the same room in the original
// route from the "Open in original" link.
//
// Architecture: React owns the page chrome (header, status, links) and the
// useWizardRoom subscription. Phaser owns the canvas. We bridge by pushing
// fen + lastAction into game.registry on every state update; the scene
// listens via 'changedata-fen' and reconciles its piece sprites.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthUid } from '../../auth/useAuthUid'
import { useWizardRoom, type WizardRoomDoc } from '../wizard/useWizardRoom'
import { BOARD_MARGIN, BOARD_SIZE, WORLD_HEIGHT, WORLD_WIDTH } from './config'
import './WizardV2Route.css'

interface PhaserGameRef {
  destroy: (removeCanvas: boolean) => void
  registry: { set: (k: string, v: unknown) => void }
}

export function WizardV2Route() {
  const { roomId = '' } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<PhaserGameRef | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const auth = useAuthUid()
  const { state } = useWizardRoom(roomId)

  // Boot Phaser once on mount. The scene subscribes to game.registry for
  // 'fen' + 'lastAction' updates; we push those from the React-side effects
  // below.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [{ default: Phaser }, { BoardScene }] = await Promise.all([
          import('phaser'),
          import('./scenes/BoardScene'),
        ])
        if (cancelled || !containerRef.current) return
        const instance = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          backgroundColor: '#0c0820',
          scene: [BoardScene],
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: true, pixelArt: false },
        })
        gameRef.current = instance as unknown as PhaserGameRef
        setPhase('ready')
      } catch (err) {
        console.error('[wizard-v2] failed to boot Phaser:', err)
        if (!cancelled) setPhase('error')
      }
    })()
    return () => {
      cancelled = true
      const g = gameRef.current
      if (g) {
        try { g.destroy(true) } catch { /* idempotent */ }
        gameRef.current = null
      }
    }
  }, [])

  // Once Phaser is up AND room state is ready, push the latest fen +
  // lastAction into the registry. Phaser's changedata events fire when these
  // values actually differ, so frequent room updates (chat, etc.) that don't
  // change the FEN are no-ops.
  useEffect(() => {
    if (phase !== 'ready') return
    const g = gameRef.current
    if (!g) return
    if (state.status !== 'ready') return
    const room = state.room
    // Flip the board for the local player if they're black.
    const youAreBlack = auth.status === 'ready' && room.black?.uid === auth.uid
    g.registry.set('flipped', youAreBlack)
    g.registry.set('fen', room.fen)
    g.registry.set('lastAction', latestMoveAction(room))
  }, [phase, state, auth])

  return (
    <div className="puc-wv2">
      <header className="puc-wv2__head">
        <button type="button" className="puc-wv2__back" onClick={() => navigate('/')}>
          ← Back to castle
        </button>
        <div className="puc-wv2__title">
          <span className="puc-wv2__title-main">Wizard's Duel · V2 preview</span>
          <span className="puc-wv2__title-sub">read-only canvas — to play, open in original</span>
        </div>
        <a
          className="puc-wv2__open-original"
          href={`/wizard/${roomId}`}
        >Open original ↗</a>
      </header>

      <div
        ref={containerRef}
        className="puc-wv2__canvas"
        style={{ aspectRatio: `${WORLD_WIDTH} / ${WORLD_HEIGHT}` }}
      >
        {phase === 'loading' && <div className="puc-wv2__msg">Loading the duel canvas…</div>}
        {phase === 'error' && <div className="puc-wv2__msg">Couldn't load the canvas.</div>}
      </div>

      <RoomBanner state={state} />

      <div className="puc-wv2__hint">
        <p>
          Width: {WORLD_WIDTH} px · Board: {BOARD_SIZE} px (with {BOARD_MARGIN} px label gutter).
        </p>
        <p>
          M0 surface — only renders moves + captures from real-time FEN.
          Spells, check, mate, castling, promotion come in Stage 2+.
        </p>
      </div>
    </div>
  )
}

function latestMoveAction(room: WizardRoomDoc): unknown {
  const actions = room.actions ?? []
  for (let i = actions.length - 1; i >= 0; i--) {
    const a = actions[i]!
    if (a.kind === 'move') return a
  }
  return null
}

function RoomBanner({ state }: { state: ReturnType<typeof useWizardRoom>['state'] }) {
  if (state.status === 'loading') return <p className="puc-wv2__banner">Loading room…</p>
  if (state.status === 'not_found') return <p className="puc-wv2__banner">Room not found.</p>
  if (state.status === 'forbidden') return <p className="puc-wv2__banner">You can't view this room.</p>
  if (state.status === 'error') return <p className="puc-wv2__banner">Error: {state.error.message}</p>
  const room = state.room
  const turnLabel = room.status === 'completed'
    ? `Game over — ${room.winner === 'w' ? 'White' : room.winner === 'b' ? 'Black' : 'Draw'}`
    : `${room.currentTurn === 'w' ? 'White' : 'Black'} to move`
  return (
    <p className="puc-wv2__banner">
      <b>{room.white.displayName}</b> vs <b>{room.black?.displayName ?? '(waiting)'}</b> · {turnLabel}
    </p>
  )
}
