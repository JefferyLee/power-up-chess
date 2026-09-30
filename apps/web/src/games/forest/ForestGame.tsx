// Forest Adventure — canvas runner ported from ../ada-advanture.
//
// Ada moves left/right, jumps trees, dodges red mushrooms (-1), collects
// gold mushrooms (+3). Three reds in a row → tree-jump disabled until two
// golds in a row reset her color. 30 points → bomb available. Game ends
// when she passes 30 trees, or score drops below 0.
//
// All gameplay state lives in refs so the render loop never re-renders.
// React state is for the start/over UX + the throttled score readout.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEventHandler } from 'react'
import bgMusicFile from './assets/Walking-in-the-forest-in-morning.mp3'
import redMushroomSoundFile from './assets/red-mushroom.mp3'
import goldenMushroomSoundFile from './assets/golden-mushroom.mp3'
import adaImage from './assets/ada.png'
import './ForestGame.css'

interface Mushroom { x: number; y: number; width: number; height: number; color: 'red' | 'gold'; speed: number }
interface Tree { x: number; y: number; width: number; height: number }
interface AdaState {
  x: number
  y: number
  width: number
  height: number
  color: 'pink' | 'gray'
  speed: number
  jumpPower: number
  isJumping: boolean
}
interface GameObjects {
  ada: AdaState
  mushrooms: Mushroom[]
  trees: Tree[]
  totaltrees: number
  score: number
  bombs: number
  goldenMushroomsInARow: number
  redMushroomsInARow: number
}
type ControlKey = 'left' | 'right' | 'up' | 'bomb'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400

const createMushroom = (canvas: HTMLCanvasElement): Mushroom => ({
  x: canvas.width + Math.random() * canvas.width,
  y: 320,
  width: 30,
  height: 30,
  color: Math.random() < 0.7 ? 'red' : 'gold',
  speed: Math.random() * 2 + 1,
})

const createTree = (canvas: HTMLCanvasElement): Tree => {
  const height = Math.random() * 200 + 100
  return { width: 30 + Math.random() * 50, height, x: canvas.width + Math.random() * canvas.width, y: 350 - height }
}

const rectCollision = (r1: { x: number; y: number; width: number; height: number }, r2: { x: number; y: number; width: number; height: number }): boolean =>
  r1.x < r2.x + r2.width && r1.x + r1.width > r2.x &&
  r1.y < r2.y + r2.height && r1.y + r1.height > r2.y

const drawButton = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = '#2a6a2a'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'white'
  ctx.font = '20px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(text, x + w / 2, y + h / 2 + 7)
}

interface Props {
  playerName: string
  onExit: () => void
  /** Called once with the final score after a run ends, so the parent can
   *  persist it (Firestore + IDB) and refresh the leaderboard. */
  onRunComplete: (finalScore: number) => void
}

export function ForestGame({ playerName, onExit, onRunComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameObjectsRef = useRef<GameObjects>({
    ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
    mushrooms: [],
    trees: [],
    totaltrees: 0,
    score: 0,
    bombs: 0,
    goldenMushroomsInARow: 0,
    redMushroomsInARow: 0,
  })
  const controlsRef = useRef<Record<ControlKey, boolean>>({ left: false, right: false, up: false, bomb: false })
  const gameActiveRef = useRef(false)
  const gameStartedRef = useRef(false)
  const bgMusicRef = useRef<HTMLAudioElement | null>(null)
  const redSoundRef = useRef<HTMLAudioElement | null>(null)
  const goldSoundRef = useRef<HTMLAudioElement | null>(null)
  const gameLoopRef = useRef<number | null>(null)
  const adaImageRef = useRef<HTMLImageElement | null>(null)
  const endGameRef = useRef<() => void>(() => {})
  const frameCountRef = useRef(0)
  const runCompleteFiredRef = useRef(false)

  const [gameState, setGameState] = useState({
    gameStarted: false,
    gameOver: true,
    totaltrees: 0,
    score: 0,
    bombs: 0,
  })

  // Audio + image setup
  useEffect(() => {
    const bg = new Audio(bgMusicFile)
    bg.volume = 0.5
    bg.loop = true
    bgMusicRef.current = bg
    redSoundRef.current = new Audio(redMushroomSoundFile)
    goldSoundRef.current = new Audio(goldenMushroomSoundFile)
    redSoundRef.current.load()
    goldSoundRef.current.load()
    const img = new Image()
    img.src = adaImage
    img.onload = () => { adaImageRef.current = img }
    return () => {
      bgMusicRef.current?.pause()
      redSoundRef.current?.pause()
      goldSoundRef.current?.pause()
    }
  }, [])

  // Main game loop — runs once on mount, reads everything from refs
  useEffect(() => {
    const endGame = () => {
      if (!gameActiveRef.current) return
      gameActiveRef.current = false
      bgMusicRef.current?.pause()
      const go = gameObjectsRef.current
      setGameState((prev) => ({ ...prev, gameOver: true, score: go.score, bombs: go.bombs, totaltrees: go.totaltrees }))
      if (!runCompleteFiredRef.current) {
        runCompleteFiredRef.current = true
        onRunComplete(go.score)
      }
    }
    endGameRef.current = endGame

    const handleRedMushroom = (go: GameObjects) => {
      go.goldenMushroomsInARow = 0
      go.redMushroomsInARow++
      if (redSoundRef.current) { redSoundRef.current.currentTime = 0; void redSoundRef.current.play().catch(() => {}) }
      go.score--
      if (go.score < 0) { endGame(); return }
      if (go.redMushroomsInARow >= 3) go.ada.color = 'gray'
    }

    const handleGoldenMushroom = (go: GameObjects) => {
      go.redMushroomsInARow = 0
      go.goldenMushroomsInARow++
      if (goldSoundRef.current) { goldSoundRef.current.currentTime = 0; void goldSoundRef.current.play().catch(() => {}) }
      go.score += 3
      go.ada.color = 'pink'
      if (go.goldenMushroomsInARow >= 2) { go.bombs++; go.score += 5 }
    }

    const loop = () => {
      const canvas = canvasRef.current
      if (!canvas) { gameLoopRef.current = requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { gameLoopRef.current = requestAnimationFrame(loop); return }
      const go = gameObjectsRef.current
      const c = controlsRef.current

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (!gameActiveRef.current) {
        // Game-over screen
        ctx.fillStyle = '#0a0815'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = 'white'
        ctx.font = 'bold 48px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('Game Over', canvas.width / 2, canvas.height / 3)
        ctx.font = '24px Arial'
        ctx.fillText(`Your Score: ${go.score}`, canvas.width / 2, canvas.height / 2)
        ctx.font = '18px Arial'
        ctx.fillText(`Trees Passed: ${go.totaltrees}`, canvas.width / 2, canvas.height / 2 + 30)
        ctx.fillText(`Bombs Used: ${go.bombs}`, canvas.width / 2, canvas.height / 2 + 60)
        const lx = canvas.width / 2 - 190
        const rx = canvas.width / 2 + 10
        const row1 = canvas.height * 0.65
        drawButton(ctx, 'Play again', lx, row1, 180, 40)
        drawButton(ctx, 'Back to Hall', rx, row1, 180, 40)
      } else {
        // Update
        if (c.left && go.ada.x > 0) go.ada.x -= go.ada.speed
        if (c.right && go.ada.x < canvas.width - go.ada.width) go.ada.x += go.ada.speed
        if (c.up && go.ada.color === 'pink' && !go.ada.isJumping) { go.ada.isJumping = true; go.ada.jumpPower = 15 }
        if (go.ada.isJumping) {
          go.ada.y -= go.ada.jumpPower
          go.ada.jumpPower -= 0.8
          if (go.ada.y >= 300) { go.ada.y = 300; go.ada.isJumping = false }
        }
        if (c.bomb && go.bombs > 0) {
          go.bombs--
          go.mushrooms = go.mushrooms.filter((m) => m.color !== 'red' || m.x >= canvas.width || m.x + m.width <= 0)
          c.bomb = false
        }
        go.mushrooms.forEach((m, i) => {
          m.x -= m.speed
          if (rectCollision(go.ada, m)) {
            if (m.color === 'red') handleRedMushroom(go); else handleGoldenMushroom(go)
            go.mushrooms[i] = createMushroom(canvas)
          } else if (m.x + m.width < 0) {
            go.mushrooms[i] = createMushroom(canvas)
          }
        })
        go.trees.forEach((t, i) => {
          t.x -= 1
          if (t.x + t.width < 0) { go.trees[i] = createTree(canvas); go.totaltrees++ }
        })
        if (go.totaltrees >= 30) { endGame(); gameLoopRef.current = requestAnimationFrame(loop); return }

        // Draw
        ctx.fillStyle = '#8fbc8f'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#90ee90'
        ctx.fillRect(0, canvas.height * 0.875, canvas.width, canvas.height)
        ctx.fillStyle = 'darkgreen'
        go.trees.forEach((t) => ctx.fillRect(t.x, t.y, t.width, t.height))
        go.mushrooms.forEach((m) => { ctx.fillStyle = m.color; ctx.fillRect(m.x, m.y, m.width, m.height) })
        if (adaImageRef.current) {
          ctx.drawImage(adaImageRef.current, go.ada.x, go.ada.y, go.ada.width, go.ada.height)
        } else {
          ctx.fillStyle = go.ada.color
          ctx.fillRect(go.ada.x, go.ada.y, go.ada.width, go.ada.height)
        }
        ctx.fillStyle = 'black'
        ctx.font = '16px Arial'
        ctx.textAlign = 'left'
        ctx.fillText(`Forest Adventure: ${playerName}`, 10, 20)
        ctx.fillText(`Score: ${go.score}`, 10, 40)
        ctx.fillText(`Bombs: ${go.bombs}`, 10, 60)
        ctx.fillStyle = 'gray'
        ctx.fillRect(0, canvas.height - 5, canvas.width * go.totaltrees / 30, 5)

        // Sync React state every 10 frames so the UI overlay updates.
        frameCountRef.current++
        if (frameCountRef.current % 10 === 0) {
          setGameState((prev) => ({ ...prev, score: go.score, bombs: go.bombs, totaltrees: go.totaltrees }))
        }
      }

      gameLoopRef.current = requestAnimationFrame(loop)
    }

    gameLoopRef.current = requestAnimationFrame(loop)
    return () => {
      if (gameLoopRef.current !== null) cancelAnimationFrame(gameLoopRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName])

  // Keyboard controls
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!gameStartedRef.current || !gameActiveRef.current) return
      const c = controlsRef.current
      if (e.code === 'ArrowLeft') c.left = true
      else if (e.code === 'ArrowRight') c.right = true
      else if (e.code === 'ArrowUp' || e.code === 'Space') c.up = true
      else if (e.code === 'KeyB') c.bomb = true
    }
    const up = (e: KeyboardEvent) => {
      const c = controlsRef.current
      if (e.code === 'ArrowLeft') c.left = false
      else if (e.code === 'ArrowRight') c.right = false
      else if (e.code === 'ArrowUp' || e.code === 'Space') c.up = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Game control callbacks
  const initGame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const go = gameObjectsRef.current
    Object.assign(go, {
      ada: { x: 50, y: 300, width: 50, height: 70, color: 'pink', speed: 5, jumpPower: 0, isJumping: false },
      mushrooms: [],
      trees: [],
      score: 0,
      totaltrees: 0,
      bombs: 0,
      goldenMushroomsInARow: 0,
      redMushroomsInARow: 0,
    })
    for (let i = 0; i < 5; i++) {
      go.mushrooms.push(createMushroom(canvas))
      go.trees.push(createTree(canvas))
      go.totaltrees++
    }
  }, [])

  const startGame = useCallback(() => {
    initGame()
    controlsRef.current = { left: false, right: false, up: false, bomb: false }
    frameCountRef.current = 0
    runCompleteFiredRef.current = false
    gameActiveRef.current = true
    gameStartedRef.current = true
    void bgMusicRef.current?.play().catch(() => {})
    setGameState((prev) => ({ ...prev, gameStarted: true, gameOver: false, score: 0, totaltrees: 0, bombs: 0 }))
  }, [initGame])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (gameActiveRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = (event.clientX - rect.left) * (canvas.width / rect.width)
      const y = (event.clientY - rect.top) * (canvas.height / rect.height)
      const lx = canvas.width / 2 - 190
      const rx = canvas.width / 2 + 10
      const row1 = canvas.height * 0.65
      const inLeft = x > lx && x < lx + 180
      const inRight = x > rx && x < rx + 180
      const inRow = y > row1 && y < row1 + 40
      if (inLeft && inRow) startGame()
      if (inRight && inRow) onExit()
    },
    [startGame, onExit],
  )

  // Touch control helpers — directly mutate ref, zero re-renders
  const press = (key: ControlKey): PointerEventHandler<HTMLButtonElement> => () => { controlsRef.current[key] = true }
  const release = (key: ControlKey): PointerEventHandler<HTMLButtonElement> => () => { controlsRef.current[key] = false }

  const isPlaying = gameState.gameStarted && !gameState.gameOver

  return (
    <div className="puc-forest">
      <div className="puc-forest__stage">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="puc-forest__canvas"
          onClick={handleCanvasClick}
          style={{ display: gameState.gameStarted ? 'block' : 'none' }}
        />

        {!gameState.gameStarted && (
          <div className="puc-forest__start">
            <p className="puc-forest__hello">Ready, {playerName}?</p>
            <button className="puc-forest__btn" type="button" onClick={startGame}>Start Game</button>
          </div>
        )}
      </div>

      {isPlaying && (
        <div className="puc-forest__touchbar">
          <div className="puc-forest__touchgroup">
            <button onPointerDown={press('left')} onPointerUp={release('left')} onPointerLeave={release('left')} aria-label="Run left" style={btnStyle}>◀</button>
            <button onPointerDown={press('right')} onPointerUp={release('right')} onPointerLeave={release('right')} aria-label="Run right" style={btnStyle}>▶</button>
          </div>
          <div className="puc-forest__touchgroup">
            <button onPointerDown={press('bomb')} onPointerUp={release('bomb')} onPointerLeave={release('bomb')} style={{ ...btnStyle, background: 'rgba(200,80,0,0.7)', minWidth: '70px' }}>💣 Bomb</button>
            <button onPointerDown={press('up')} onPointerUp={release('up')} onPointerLeave={release('up')} style={{ ...btnStyle, background: 'rgba(0,120,200,0.7)', minWidth: '70px' }}>▲ Jump</button>
          </div>
        </div>
      )}
    </div>
  )
}

const btnStyle: CSSProperties = {
  fontSize: '22px',
  padding: '14px 20px',
  minWidth: '60px',
  background: 'rgba(255,255,255,0.18)',
  color: 'white',
  border: '2px solid rgba(255,255,255,0.4)',
  borderRadius: '8px',
  cursor: 'pointer',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
}
