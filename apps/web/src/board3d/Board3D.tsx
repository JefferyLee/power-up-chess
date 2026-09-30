// Board3D — three.js (react-three-fiber) renderer implementing the
// same view-protocol as the 2D Board component: pieces / turn /
// legalDestinationsFrom / onMove / lastMove / checkSquare. All chess
// legality lives with the caller; this is purely an alternate view.
//
// Interaction model: tap a piece's square, legal destinations light
// up, tap one to move (mirrors the 2D click flow — no 3D dragging,
// which is miserable on touch). Promotion auto-queens, same as 2D.
//
// The camera orbits freely (OrbitControls). It swings round smoothly
// when `facing` changes (pass-and-play) or on the Flip button, and
// otherwise stays wherever the player leaves it.
//
// Move/capture choreography (all cosmetic — chess.js already decided):
//   - movers glide square→square, duration scaling with distance
//     (moveDuration); sliders lift a touch, knights hop a parabolic arc
//   - the landing square flashes an expanding golden ring
//   - a capture is a short DUEL (duel.ts): the attacker halts short of
//     the victim, feints twice (sparks + a clash sound), then hops on
//     while the victim pops (scale up → gone) in a burst of sparkles.
//     Skippable — button or any tap — by speeding the timeline up.
// Move/capture SOUNDS stay with the screens (they already play
// 'move'/'capture'/'check' at move time). The one sound here is the
// duel clash, which exists nowhere else, panned by view-space x.

import { createContext, Suspense, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Html, OrbitControls, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { Color, MoveInput, Piece as PieceModel, PieceSymbol, Square as SquareName } from '../chess/types'
import { FILES, RANKS, squareColor, type File, type Rank } from '../board/squares'
import { playSound } from '../sound/synth'
import { pieceGeometries } from './pieceGeometry'
import { useGltfPieceAssets } from './gltfPieces'
import { usePieceTracking, type CapturedPiece, type TrackedPiece } from './usePieceTracking'
import { easeInOutCubic, easeOutBack } from './timeline'
import { buildDuel, finishDuel, moveDuration, HOP_HEIGHT, LIFT, type DuelState } from './duel'
import { RingPulse, SparkBurst, Torch, rollSparks } from './fx'
import { describeAction, describeSquare, stepCursor } from './kbCursor'
import { usePrefersReducedMotion } from '../a11y/usePrefersReducedMotion'
import { KEYS } from '../storage/keys'
import { usePersistedState } from '../storage/usePersistedState'
import './Board3D.css'

export interface Board3DProps {
  pieces: Partial<Record<SquareName, PieceModel>>
  turn: Color
  legalDestinationsFrom: (from: SquareName) => SquareName[]
  onMove: (move: MoveInput) => void
  lastMove?: { from: SquareName; to: SquareName } | null
  checkSquare?: SquareName | null
  /** Which side the camera starts behind. Online passes the viewer's
   *  colour so Black opens facing their own camp. Default: white. */
  initialSide?: Color
  /** Pass-and-play: the side whose turn it is. When it changes the
   *  camera swings smoothly round behind that side. Undefined = the
   *  camera stays wherever the player left it. */
  facing?: Color
  /** Wizard's Duel spell-targeting mode: taps pick a target instead of
   *  moving. firstPick is the already-chosen half of a 2-arity spell. */
  spellPick?: { validTargets: ReadonlySet<SquareName>; firstPick?: SquareName | null } | null
  onSpellTarget?: (sq: SquareName) => void
  /** Emoji status badges floated above squares (❄ 🛡 👻 …). */
  badges?: Partial<Record<SquareName, string>>
}

/** Board-square (file, rank) → world x/z. Board is centred on the
 *  origin, one square = 1 world unit, +z toward White's side. */
function squareToWorld(sq: SquareName): [number, number] {
  const fileIdx = FILES.indexOf(sq[0] as File)
  const rankIdx = RANKS.indexOf(sq[1] as Rank)
  return [fileIdx - 3.5, 3.5 - rankIdx]
}

/* Two selectable looks for the 3D set (Ada picks via the corner
 * toggle; the choice persists in localStorage):
 *
 *  - 'wood'    — the realistic painted-wood set. Square/frame colours
 *    MULTIPLY the wood-grain texture (>1 components brighten and pull
 *    the cast off red); piece colours multiply the Glowbox baseColor
 *    maps. The dark map is so dark it needs >1 tint just to climb out
 *    of the mud into a visible warm walnut.
 *  - 'candy' — flat colourful board (no textures, colours render almost
 *    as-is). A cream + deep-blue board with clean ivory-vs-navy pieces.
 *    Toned down from the first attempt: the blue is deeper (was too pale
 *    and glary), the rail is dark slate (was an ugly pink/purple), and
 *    there is NO pink anywhere. Low clearcoat for a soft sheen. */
export type Palette3dName = 'wood' | 'candy'

interface Palette3d {
  /** Apply the wood-grain texture to squares/frame/trays. */
  texturedBoard: boolean
  /** Apply the Glowbox baseColor maps to the pieces. */
  texturedPieces: boolean
  squareLight: THREE.ColorRepresentation
  squareDark: THREE.ColorRepresentation
  frame: THREE.ColorRepresentation
  /** Piece colour — multiplies the map in 'wood', stands alone in 'candy'. */
  white: THREE.ColorRepresentation
  black: THREE.ColorRepresentation
  /** Scene fill so the chosen look never reads dark. */
  ambient: number
  /** Piece clearcoat — soft sheen, dialled down from the old toy gloss. */
  clearcoat: number
  /** Scene background (and fog) colour, and the table under the board. */
  bg: THREE.ColorRepresentation
  ground: THREE.ColorRepresentation
  /** Rank/file labels painted on the frame (CSS colour). */
  coords: string
}

const PALETTES: Record<Palette3dName, Palette3d> = {
  // Measured on screenshots (2026-09-24): with the grain multiplied into
  // BOTH square colours the "light" squares rendered #90462d and the
  // dark ones #663223 — a 1.5:1 ratio, and black pieces vanished on
  // dark squares (1.15:1). The wood.jpg grain is too dark and red to
  // multiply up to maple, so only the dark squares (walnut) keep it;
  // light squares are flat tan, pieces are flat boxwood / ebony.
  wood: {
    texturedBoard: true,
    texturedPieces: false,
    // Flat colours render ~+30 sRGB brighter than specified under the
    // scene lights (a tan spec reads as maple); pieces render darker
    // than spec (curved, half in shadow). Specs are set for the
    // RENDERED result: maple ≈ #cdb076, walnut ≈ #944229, boxwood ≈
    // #e7e0d5, ebony ≈ #3c2c1a — 3.4:1 squares, 1.6:1 white piece on
    // maple, 2:1 ebony on walnut.
    squareLight: '#9e7f4c',
    squareDark: new THREE.Color(2.5, 2.1, 1.6),
    frame: new THREE.Color(0.92, 0.8, 0.64),
    white: '#efe3c4',        // ivory, not white — Jeff's call; renders ≈ #ddd2b6
    black: '#1a100a',
    ambient: 0.42,
    clearcoat: 0.7,
    bg: '#120e0b',
    ground: '#1c1511',
    coords: 'rgba(255, 234, 196, 0.7)',
  },
  // Sand + navy board, ivory vs charcoal pieces. No pink anywhere.
  // The old cream (#ecdfc4) rendered near-white (#ede7dc) under the
  // scene lights, so ivory pieces sat on it at 1.08:1; the old blue
  // washed out to #8cb8d1. Darker sand + deeper navy spread the four
  // tones out: white piece > light square > dark square > black piece.
  candy: {
    texturedBoard: false,
    texturedPieces: false,
    squareLight: '#a99461',  // sand — renders ≈ #cbbb90
    squareDark: '#1e4d7d',   // navy — renders ≈ #3d70a2
    frame: '#2f3b52',        // dark slate-blue rail
    white: '#f2e9d2',        // ivory — renders ≈ #e0d8c6, still clear of the sand
    black: '#141a26',        // near-black navy — reads on both squares
    ambient: 0.52,
    clearcoat: 0.4,
    bg: '#0f1424',
    ground: '#171e33',
    coords: 'rgba(236, 223, 196, 0.92)',
  },
}

const PaletteContext = createContext<Palette3d>(PALETTES.wood)
const usePalette = () => useContext(PaletteContext)

/** The duel in flight (or null), shared with the piece meshes as a REF
 *  so they read/mutate it from their frame loops — never during render.
 *  Same reconciler-boundary caveat as PaletteContext: provided inside
 *  the Canvas. */
const DuelContext = createContext<RefObject<DuelState | null>>({ current: null })

/** Untextured pieces (candy mode, or the procedural fallback before the
 *  GLTF set lands) take the flat colour; textured wood pieces multiply
 *  the map by it. Same colour key either way. */
function pieceTint(color: Color, palette: Palette3d): THREE.ColorRepresentation {
  return color === 'w' ? palette.white : palette.black
}

const paletteCodec = {
  // 'classic' is a legacy value from the brief green-board version.
  parse: (v: string): Palette3dName => (v === 'candy' || v === 'classic' ? 'candy' : 'wood'),
  serialize: (v: Palette3dName) => v,
}
const TINT_SELECTED = '#f1c34c'
const TINT_LEGAL = '#7cc28b'
const TINT_CAPTURE = '#ef8a5a'
const TINT_LASTMOVE = '#b9a3ff'
const TINT_CHECK = '#e05a4a'
const TINT_SPELL = '#a06bff'

const ENV_URL = '/models3d/env/st_fagans_interior_1k.hdr'
const WOOD_URL = '/models3d/env/wood.jpg'

/** Fallback wait before a captured piece pops when no duel could be
 *  staged (the attacker wasn't identified) — roughly one glide. */
const MOVE_DUR = 0.45
/** A duel that never gets going (mesh never registered) still pops
 *  the victim after this long, so nothing is left standing. */
const DUEL_TIMEOUT = 6
const POP_DUR = 0.38
/** Sparkles keep twinkling this long after the pop finishes. */
const POP_LINGER = 0.5
/** Captured pieces re-materialise at this size in the side trays. */
const GRAVE_SCALE = 0.5
const GRAVE_IN_DUR = 0.35
/** Outer size of the board frame (8 squares + a 0.6 rail each side). */
const FRAME_SIZE = 9.2
/** Corner braziers, just outside the capture trays. */
const TORCHES: Array<[number, number]> = [[-5.3, -6.1], [5.3, -6.1], [-5.3, 6.1], [5.3, 6.1]]

/** Tray slot for the i-th captured piece of a colour. White's fallen
 *  pieces line up on Black's side of the board and vice versa — like
 *  a real over-the-board game. Two rows of eight. */
function graveSlot(color: Color, index: number): [number, number] {
  const side = color === 'w' ? -1 : 1
  const x = -2.24 + (index % 8) * 0.64
  const z = side * (5.18 + 0.66 * Math.floor(index / 8))
  return [x, z]
}

/** Wood grain for the squares + frame. Loaded WITHOUT suspending so
 *  the board paints instantly in flat colours and the grain fades in
 *  when the 69 KB jpg arrives (runtime-cached thereafter). */
function useWoodTexture(): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  const texRef = useRef<THREE.Texture | null>(null)
  useEffect(() => {
    let disposed = false
    new THREE.TextureLoader().load(WOOD_URL, (t) => {
      if (disposed) {
        t.dispose()
        return
      }
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      texRef.current = t
      setTex(t)
    })
    return () => {
      disposed = true
      texRef.current?.dispose()
      texRef.current = null
    }
  }, [])
  return tex
}

function Squares({
  selected,
  legal,
  capture,
  lastMove,
  checkSquare,
  spellTargets,
  firstPick,
  wood,
  onTap,
}: {
  selected: SquareName | null
  legal: ReadonlySet<SquareName>
  capture: ReadonlySet<SquareName>
  lastMove: { from: SquareName; to: SquareName } | null
  checkSquare: SquareName | null
  spellTargets: ReadonlySet<SquareName> | null
  firstPick: SquareName | null
  wood: THREE.Texture | null
  onTap: (sq: SquareName) => void
}) {
  const palette = usePalette()
  const cells = useMemo(() => {
    const out: Array<{ sq: SquareName; x: number; z: number; dark: boolean }> = []
    for (const f of FILES) {
      for (const r of RANKS) {
        const sq = `${f}${r}` as SquareName
        const [x, z] = squareToWorld(sq)
        out.push({ sq, x, z, dark: squareColor(f, r) === 'dark' })
      }
    }
    return out
  }, [])

  const tints = useMemo(() => {
    const out = new Map<SquareName, string>()
    for (const { sq } of cells) {
      let tint: string | null = null
      if (checkSquare === sq) tint = TINT_CHECK
      else if (firstPick === sq) tint = TINT_SELECTED
      else if (selected === sq) tint = TINT_SELECTED
      else if (spellTargets?.has(sq)) tint = TINT_SPELL
      else if (capture.has(sq)) tint = TINT_CAPTURE
      else if (legal.has(sq)) tint = TINT_LEGAL
      else if (lastMove && (lastMove.from === sq || lastMove.to === sq)) tint = TINT_LASTMOVE
      if (tint) out.set(sq, tint)
    }
    return out
  }, [cells, selected, legal, capture, lastMove, checkSquare, spellTargets, firstPick])

  // Check and selection BREATHE; everything else holds a steady glow.
  // The frame loop writes emissiveIntensity straight onto the materials
  // (useFrame re-reads its callback every render, so these props are
  // always current).
  const mats = useRef(new Map<SquareName, THREE.MeshStandardMaterial>())
  const pulsing = firstPick ?? selected
  // prefers-reduced-motion: the breathing squares hold a steady glow.
  const reduced = usePrefersReducedMotion()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (const [sq, mat] of mats.current) {
      if (!tints.has(sq)) mat.emissiveIntensity = 0
      else if (reduced) mat.emissiveIntensity = sq === checkSquare ? 0.7 : 0.55
      else if (sq === checkSquare) mat.emissiveIntensity = 0.5 + 0.3 * Math.sin(6 * t)
      else if (sq === pulsing) mat.emissiveIntensity = 0.55 + 0.15 * Math.sin(3 * t)
      else mat.emissiveIntensity = 0.55
    }
  })

  return (
    <group>
      {cells.map(({ sq, x, z, dark }) => {
        const tint = tints.get(sq) ?? null
        return (
          <mesh
            key={sq}
            position={[x, -0.05, z]}
            onClick={(e) => { e.stopPropagation(); onTap(sq) }}
            receiveShadow
          >
            <boxGeometry args={[1, 0.1, 1]} />
            {/* key remounts the material once when the grain arrives —
              * sidesteps map null→texture recompile pitfalls. */}
            {/* Low envMapIntensity — full environment fill washed the
              * directional shadows right off the board. */}
            <meshStandardMaterial
              key={wood ? 'wood' : 'flat'}
              ref={(m) => { if (m) mats.current.set(sq, m) }}
              map={dark ? wood : null}
              color={dark ? palette.squareDark : palette.squareLight}
              emissive={tint ?? '#000000'}
              emissiveIntensity={tint ? 0.55 : 0}
              roughness={0.8}
              envMapIntensity={0.55}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/** The keyboard cursor: a flat frame on the focused square in the
 *  selection colour. Steady by design (it's a cursor, not a pulse), so
 *  it needs no reduced-motion branch. */
function CursorFrame({ sq }: { sq: SquareName }) {
  const [x, z] = squareToWorld(sq)
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-0.5, -0.5)
    shape.lineTo(0.5, -0.5)
    shape.lineTo(0.5, 0.5)
    shape.lineTo(-0.5, 0.5)
    shape.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-0.42, -0.42)
    hole.lineTo(0.42, -0.42)
    hole.lineTo(0.42, 0.42)
    hole.lineTo(-0.42, 0.42)
    hole.closePath()
    shape.holes.push(hole)
    return new THREE.ShapeGeometry(shape)
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial color={TINT_SELECTED} toneMapped={false} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  )
}

/** Rank/file labels on the frame — reading a1…h8 is half of learning
 *  chess, and the 3D board had none. Painted once per palette into a
 *  canvas laid over the frame; upright from White's side. */
function BoardCoords() {
  const palette = usePalette()
  const texture = useMemo(() => {
    const size = 1024
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')
    if (!g) return null
    const px = size / FRAME_SIZE
    // World x/z → canvas x/y. Canvas row 0 is the far (Black) edge.
    const toC = (w: number) => (w + FRAME_SIZE / 2) * px
    g.font = `bold ${Math.round(0.34 * px)}px Georgia, serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = palette.coords
    FILES.forEach((f, i) => {
      g.fillText(f, toC(i - 3.5), toC(4.3))
      g.fillText(f, toC(i - 3.5), toC(-4.3))
    })
    RANKS.forEach((r, i) => {
      g.fillText(r, toC(-4.3), toC(3.5 - i))
      g.fillText(r, toC(4.3), toC(3.5 - i))
    })
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [palette.coords])
  useEffect(() => () => texture?.dispose(), [texture])
  if (!texture) return null
  return (
    <mesh position={[0, -0.094, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[FRAME_SIZE, FRAME_SIZE]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** OrbitControls plus two things they don't do: an eased swing to a
 *  target azimuth (pass-and-play `facing` / the Flip button), and a
 *  soft fill light that rides with the camera so whichever side you
 *  view from, the near faces of the pieces are never in the dark. */
function CameraRig({ facing, flipSeq }: { facing: Color | undefined; flipSeq: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const duelRef = useContext(DuelContext)
  const fill = useRef<THREE.PointLight>(null)
  const { camera } = useThree()
  /** Desired azimuth (radians), or null when nothing is pending. */
  const goal = useRef<number | null>(null)
  const dragging = useRef(false)

  const prevFacing = useRef(facing)
  useEffect(() => {
    if (facing !== undefined && facing !== prevFacing.current) goal.current = facing === 'w' ? 0 : Math.PI
    prevFacing.current = facing
  }, [facing])
  const prevFlip = useRef(flipSeq)
  useEffect(() => {
    if (flipSeq === prevFlip.current) return
    prevFlip.current = flipSeq
    const c = controls.current
    if (c) goal.current = (goal.current ?? c.getAzimuthalAngle()) + Math.PI
  }, [flipSeq])

  useFrame((_, dt) => {
    if (fill.current) fill.current.position.set(camera.position.x, camera.position.y + 2, camera.position.z)
    const c = controls.current
    const g = goal.current
    if (!c || g === null || dragging.current) return
    // A pending swing waits for a duel to play out — the turn changes
    // the moment the capture is made, and spinning the camera away from
    // the fight was the first thing the screenshots showed.
    const duel = duelRef.current
    if (duel && !duel.done) return
    let d = g - c.getAzimuthalAngle()
    d = Math.atan2(Math.sin(d), Math.cos(d)) // shortest way round
    if (Math.abs(d) < 0.002) {
      goal.current = null
      return
    }
    // Exponential ease: ~0.8 s for a full half-turn, frame-rate free.
    const step = d * (1 - Math.pow(0.02, dt))
    const off = camera.position.clone().sub(c.target)
    off.applyAxisAngle(Y_AXIS, step)
    camera.position.copy(c.target).add(off)
    camera.lookAt(c.target)
    c.update()
  })

  return (
    <>
      <pointLight ref={fill} intensity={5} color="#c9d6f0" distance={26} decay={2} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        minDistance={5}
        maxDistance={16}
        maxPolarAngle={Math.PI / 2.15}
        /* A hand on the camera cancels any pending swing. */
        onStart={() => { dragging.current = true; goal.current = null }}
        onEnd={() => { dragging.current = false }}
      />
    </>
  )
}
const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** Ticks the duel timeline. Builds it on the first frame both meshes
 *  have registered (the attacker's AnimatedPiece and the victim's
 *  DyingPiece hand themselves over through the DuelContext ref). */
function DuelRunner({
  onClash,
  onLanded,
  onDone,
}: {
  onClash: (x: number, y: number, z: number) => void
  onLanded: (sq: SquareName) => void
  onDone: () => void
}) {
  const duelRef = useContext(DuelContext)
  const { camera } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    const d = duelRef.current
    if (!d || d.done) return
    if (!d.timeline) {
      if (!d.attacker || !d.victimMesh) return
      d.timeline = buildDuel(d, {
        onClash: (x, y, z) => {
          onClash(x, y, z)
          // Pan by where the clash sits on screen, not on the board.
          v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse)
          playSound('duel-clash', { pan: Math.max(-1, Math.min(1, v.x / 4)) * 0.7 })
        },
        onLanded: () => onLanded(d.toSquare),
      })
      if (d.skipRequested) d.timeline.skip()
    }
    if (d.timeline.tick(dt)) {
      d.done = true
      onDone()
    }
  })
  return null
}

interface MoveAnim {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  t: number
  dur: number
  hop: boolean
}

function startMove(fromX: number, fromZ: number, toX: number, toZ: number, hop: boolean): MoveAnim {
  return { fromX, fromZ, toX, toZ, t: 0, dur: moveDuration(Math.hypot(toX - fromX, toZ - fromZ)), hop }
}

/** One persistent mesh per tracked piece. A move starts an explicit
 *  0→1 tween (knights arc over the board); when it completes the
 *  parent gets onLanded() to flash the landing ring. If the move is a
 *  capture, the frame loop hands the mesh to the duel instead, which
 *  drives it until done. Position is imperative-only — NEVER a reactive
 *  prop, or every re-render would teleport long-since-moved pieces back
 *  to their mount square. */
function AnimatedPiece({
  tracked,
  geometry,
  map,
  rotateBlack,
  scale,
  isSelected,
  inCheck,
  onTap,
  onLanded,
}: {
  tracked: TrackedPiece
  geometry: THREE.BufferGeometry
  map: THREE.Texture | null
  rotateBlack: boolean
  scale: number
  isSelected: boolean
  inCheck: boolean
  onTap: (sq: SquareName) => void
  onLanded: (sq: SquareName) => void
}) {
  const palette = usePalette()
  const duelRef = useContext(DuelContext)
  const ref = useRef<THREE.Mesh>(null)
  const anim = useRef<MoveAnim | null>(null)
  const prevSquare = useRef(tracked.square)
  const [tx, tz] = squareToWorld(tracked.square)

  // Check moment: the king wobbles (decaying sine) when check arrives.
  // The red glow itself is declarative via the material props below.
  const wobble = useRef<number | null>(null)
  const prevCheck = useRef(inCheck)
  if (inCheck && !prevCheck.current) wobble.current = 0
  prevCheck.current = inCheck

  // Square changed since last render → start a tween from wherever the
  // mesh currently is (it may still be mid-glide). Ref mutation during
  // render is deliberate and idempotent.
  if (prevSquare.current !== tracked.square) {
    prevSquare.current = tracked.square
    const m = ref.current
    const [fx, fz] = m
      ? [m.position.x, m.position.z]
      : squareToWorld(tracked.movedFrom ?? tracked.square)
    anim.current = startMove(fx, fz, tx, tz, tracked.piece.type === 'n')
  }

  const placed = useRef(false)
  const setRef = useCallback((m: THREE.Mesh | null) => {
    ref.current = m
    if (m && !placed.current) {
      placed.current = true
      // A mesh that mounts mid-move (movedFrom set) starts at the FROM
      // square and tweens in; otherwise it appears in place.
      if (tracked.movedFrom) {
        const [fx, fz] = squareToWorld(tracked.movedFrom)
        const [sx, sz] = squareToWorld(tracked.square)
        m.position.set(fx, 0, fz)
        anim.current = startMove(fx, fz, sx, sz, tracked.piece.type === 'n')
      } else {
        const [sx, sz] = squareToWorld(tracked.square)
        m.position.set(sx, 0, sz)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, delta) => {
    const m = ref.current
    if (!m) return
    const d = duelRef.current
    if (d && !d.done && d.attackerId === tracked.id) {
      if (d.toSquare === tracked.square) {
        // This move IS the duel: hand the mesh over, drop our own glide.
        d.attacker = m
        anim.current = null
        return
      }
      // Moved on while the duel still ran (quick pass-and-play): wrap
      // it up and glide on from here.
      finishDuel(d)
    }
    // Decaying wobble around z — composes fine with the colour-facing
    // rotation around y.
    if (wobble.current !== null) {
      wobble.current += delta
      const t = wobble.current
      if (t >= 1.4) {
        m.rotation.z = 0
        wobble.current = null
      } else {
        m.rotation.z = 0.13 * Math.sin(15 * t) * Math.exp(-2.8 * t)
      }
    }
    const a = anim.current
    if (a) {
      a.t = Math.min(1, a.t + delta / a.dur)
      const e = easeInOutCubic(a.t)
      m.position.x = a.fromX + (a.toX - a.fromX) * e
      m.position.z = a.fromZ + (a.toZ - a.fromZ) * e
      m.position.y = a.hop ? HOP_HEIGHT * 4 * e * (1 - e) : LIFT * Math.sin(Math.PI * e)
      if (a.t >= 1) {
        anim.current = null
        m.position.set(a.toX, 0, a.toZ)
        onLanded(tracked.square)
      }
      return
    }
    // Idle: ease the selection lift and settle any residual drift.
    const targetY = isSelected ? 0.12 : 0
    const k = 1 - Math.exp(-delta * 10)
    m.position.x += (tx - m.position.x) * k
    m.position.z += (tz - m.position.z) * k
    m.position.y += (targetY - m.position.y) * k
  })

  return (
    <mesh
      ref={setRef}
      geometry={geometry}
      rotation={[0, rotateBlack && tracked.piece.color === 'b' ? Math.PI : 0, 0]}
      scale={scale}
      castShadow
      onClick={(e) => { e.stopPropagation(); onTap(tracked.square) }}
      /* Geometries are shared module-level caches — never let R3F
       * dispose them when one piece unmounts (capture). */
      dispose={null}
    >
      <meshPhysicalMaterial
        map={map}
        color={pieceTint(tracked.piece.color, palette)}
        emissive={inCheck ? TINT_CHECK : isSelected ? TINT_SELECTED : '#000000'}
        emissiveIntensity={inCheck ? 0.5 : isSelected ? 0.35 : 0}
        roughness={0.45}
        metalness={0.05}
        clearcoat={palette.clearcoat}
        clearcoatRoughness={0.25}
        envMapIntensity={0.6}
      />
    </mesh>
  )
}

/** A captured piece's last moment. In a duel it reels under the
 *  attacker's feints (duel.ts drives its transform) until the pop cue;
 *  otherwise it stands its ground for one glide (MOVE_DUR). Either way
 *  it then pops — a quick swell and collapse inside a burst of
 *  sparkles — and re-materialises in the tray. */
function DyingPiece({
  info,
  geometry,
  map,
  rotateBlack,
  scale,
  onDone,
}: {
  info: CapturedPiece
  geometry: THREE.BufferGeometry
  map: THREE.Texture | null
  rotateBlack: boolean
  scale: number
  onDone: (info: CapturedPiece) => void
}) {
  const palette = usePalette()
  const duelRef = useContext(DuelContext)
  const ref = useRef<THREE.Mesh>(null)
  const life = useRef(0)
  /** Reading on `life` when the pop began; null until it does. */
  const popStart = useRef<number | null>(null)
  const done = useRef(false)
  const [sparkling, setSparkling] = useState(false)
  const [x, z] = squareToWorld(info.square)

  useFrame((_, delta) => {
    life.current += delta
    const m = ref.current
    if (popStart.current === null) {
      const d = duelRef.current
      if (d && d.id === info.id) {
        if (m && d.victimMesh !== m) {
          d.victimMesh = m
          d.victimBase = m.quaternion.clone()
        }
        // Wait for the cue — or bail if the duel died before it built,
        // so nothing is left standing on the square.
        if (!d.popped && !d.done && life.current < DUEL_TIMEOUT) return
      } else if (life.current < MOVE_DUR) {
        // No duel staged for this capture: stand for one glide, then pop.
        return
      }
      popStart.current = life.current
    }
    const t = life.current - popStart.current
    if (t <= 0) return
    if (!sparkling) setSparkling(true)
    if (m) {
      const p = Math.min(1, t / POP_DUR)
      const s = p < 0.35
        ? 1 + 0.18 * (p / 0.35)
        : Math.max(0, 1.18 * (1 - (p - 0.35) / 0.65))
      m.scale.setScalar(s * scale)
      m.visible = s > 0.001
    }
    if (t >= POP_DUR + POP_LINGER && !done.current) {
      done.current = true
      onDone(info)
    }
  })

  return (
    <group>
      <mesh
        ref={ref}
        geometry={geometry}
        scale={scale}
        position={[x, 0, z]}
        rotation={[0, rotateBlack && info.piece.color === 'b' ? Math.PI : 0, 0]}
        castShadow
        dispose={null}
      >
        <meshPhysicalMaterial
          map={map}
          color={pieceTint(info.piece.color, palette)}
          roughness={0.45}
          metalness={0.05}
          clearcoat={palette.clearcoat}
          clearcoatRoughness={0.25}
          envMapIntensity={0.6}
        />
      </mesh>
      {sparkling && (
        <Sparkles
          position={[x, 0.45, z]}
          count={18}
          scale={1}
          size={5}
          speed={1.4}
          color="#ffd95e"
        />
      )}
    </group>
  )
}

/** A captured piece re-materialising in its tray slot — scales in with
 *  a small overshoot, then sits still as a material-count reminder. */
function GravePiece({
  info,
  index,
  geometry,
  map,
  rotateBlack,
  scale,
}: {
  info: CapturedPiece
  index: number
  geometry: THREE.BufferGeometry
  map: THREE.Texture | null
  rotateBlack: boolean
  scale: number
}) {
  const palette = usePalette()
  const ref = useRef<THREE.Mesh>(null)
  const life = useRef(0)
  const [x, z] = graveSlot(info.piece.color, index)
  const setRef = useCallback((m: THREE.Mesh | null) => {
    ref.current = m
    if (m && life.current === 0) m.scale.setScalar(0)
  }, [])
  useFrame((_, delta) => {
    const m = ref.current
    if (!m) return
    // Slots shift as the tray fills two rows — ease toward the slot.
    const k = 1 - Math.exp(-delta * 10)
    m.position.x += (x - m.position.x) * k
    m.position.z += (z - m.position.z) * k
    if (life.current >= GRAVE_IN_DUR) return
    life.current = Math.min(GRAVE_IN_DUR, life.current + delta)
    m.scale.setScalar(GRAVE_SCALE * scale * easeOutBack(life.current / GRAVE_IN_DUR))
  })
  return (
    <mesh
      ref={setRef}
      geometry={geometry}
      position={[x, 0, z]}
      rotation={[0, rotateBlack && info.piece.color === 'b' ? Math.PI : 0, 0]}
      castShadow
      dispose={null}
    >
      <meshPhysicalMaterial
        map={map}
        color={pieceTint(info.piece.color, palette)}
        roughness={0.6}
        metalness={0.05}
        clearcoat={0.4}
        clearcoatRoughness={0.35}
        envMapIntensity={0.45}
      />
    </mesh>
  )
}

function PiecesInner({
  tracked,
  dying,
  graveyard,
  geos,
  maps,
  rotateBlack,
  scale,
  selected,
  checkSquare,
  onTap,
  onLanded,
  onDeadDone,
}: {
  tracked: TrackedPiece[]
  dying: CapturedPiece[]
  graveyard: CapturedPiece[]
  geos: Record<Color, Record<PieceSymbol, THREE.BufferGeometry>>
  maps: Record<Color, THREE.Texture | null>
  rotateBlack: boolean
  scale: number
  selected: SquareName | null
  checkSquare: SquareName | null
  onTap: (sq: SquareName) => void
  onLanded: (sq: SquareName) => void
  onDeadDone: (info: CapturedPiece) => void
}) {
  const whiteTaken = graveyard.filter((g) => g.piece.color === 'w')
  const blackTaken = graveyard.filter((g) => g.piece.color === 'b')
  return (
    <group>
      {tracked.map((t) => (
        <AnimatedPiece
          key={t.id}
          tracked={t}
          geometry={geos[t.piece.color][t.piece.type]}
          map={maps[t.piece.color]}
          rotateBlack={rotateBlack}
          scale={scale}
          isSelected={selected === t.square}
          inCheck={checkSquare === t.square}
          onTap={onTap}
          onLanded={onLanded}
        />
      ))}
      {dying.map((d) => (
        <DyingPiece
          key={d.id}
          info={d}
          geometry={geos[d.piece.color][d.piece.type]}
          map={maps[d.piece.color]}
          rotateBlack={rotateBlack}
          scale={scale}
          onDone={onDeadDone}
        />
      ))}
      {whiteTaken.map((g, i) => (
        <GravePiece
          key={g.id}
          info={g}
          index={i}
          geometry={geos[g.piece.color][g.piece.type]}
          map={maps[g.piece.color]}
          rotateBlack={rotateBlack}
          scale={scale}
        />
      ))}
      {blackTaken.map((g, i) => (
        <GravePiece
          key={g.id}
          info={g}
          index={i}
          geometry={geos[g.piece.color][g.piece.type]}
          map={maps[g.piece.color]}
          rotateBlack={rotateBlack}
          scale={scale}
        />
      ))}
    </group>
  )
}

interface PiecesProps {
  tracked: TrackedPiece[]
  dying: CapturedPiece[]
  graveyard: CapturedPiece[]
  selected: SquareName | null
  checkSquare: SquareName | null
  onTap: (sq: SquareName) => void
  onLanded: (sq: SquareName) => void
  onDeadDone: (info: CapturedPiece) => void
}

/** GLTF-model pieces (Glowbox set — see public/models3d/CREDITS.md).
 *  Suspends while the set downloads. The two colours are authored
 *  facing each other, so no render-time flip. */
function PiecesGltf(props: PiecesProps) {
  const palette = usePalette()
  const { geos, maps } = useGltfPieceAssets()
  // Candy mode keeps the carved geometry but drops the wood baseColor
  // maps, so the pieces read as flat glossy toy colours.
  return (
    <PiecesInner
      geos={geos}
      maps={palette.texturedPieces ? maps : NO_MAPS}
      rotateBlack={false}
      scale={1}
      {...props}
    />
  )
}

const NO_MAPS: Record<Color, THREE.Texture | null> = { w: null, b: null }

/** Procedural low-poly pieces — instant, used as the Suspense
 *  fallback while the GLTF set streams in. */
function PiecesProcedural(props: PiecesProps) {
  const geos = useMemo(() => {
    const g = pieceGeometries()
    return { w: g, b: g }
  }, [])
  return <PiecesInner geos={geos} maps={NO_MAPS} rotateBlack scale={1.25} {...props} />
}

export function Board3D({
  pieces,
  turn,
  legalDestinationsFrom,
  onMove,
  lastMove = null,
  checkSquare = null,
  initialSide = 'w',
  facing,
  spellPick = null,
  onSpellTarget,
  badges,
}: Board3DProps) {
  const [selected, setSelected] = useState<SquareName | null>(null)
  // Keyboard cursor (a11y): arrows walk the squares, Enter/Space taps
  // the cursor square through the same tap() as pointer input, Escape
  // clears. Dropped on blur so no stale frame lingers on the board.
  // `announce` feeds the visually-hidden live region.
  const [kbCursor, setKbCursor] = useState<SquareName | null>(null)
  const [announce, setAnnounce] = useState('')
  const hintId = useId()
  // The chosen 3D look (wood / candy). Persisted so Ada's pick sticks
  // across screens and sessions.
  const [paletteName, setPaletteName] = usePersistedState<Palette3dName>(KEYS.board3dPalette, 'wood', paletteCodec)
  const palette = PALETTES[paletteName]
  const togglePalette = useCallback(() => {
    setPaletteName((p) => (p === 'candy' ? 'wood' : 'candy'))
  }, [setPaletteName])
  // Stable per-piece identity + movedFrom/captured diffs — drives one
  // persistent animated mesh per piece.
  const { tracked, captured, bulkChange } = usePieceTracking(pieces)
  const woodTex = useWoodTexture()
  // Candy mode renders flat (untextured) board + frame.
  const wood = palette.texturedBoard ? woodTex : null

  // A capture stages a duel. Derived DURING render (React's "adjust
  // state on prop change" pattern) so the attacker's AnimatedPiece can
  // hand its mesh over on the very next frame; the piece meshes reach
  // the record through DuelContext (a ref, synced below) from their
  // frame loops. A board reset drops any duel in flight; a second
  // capture arriving mid-duel (fast pass-and-play) wraps the first up.
  const [duel, setDuel] = useState<DuelState | null>(null)
  const [duelActive, setDuelActive] = useState(false)
  const victim = captured.length === 1 ? captured[0] : undefined
  if (bulkChange) {
    if (duel) {
      finishDuel(duel)
      setDuel(null)
      setDuelActive(false)
    }
  } else if (victim && duel?.id !== victim.id) {
    const attacker = tracked.find(
      (t): t is TrackedPiece & { movedFrom: SquareName } => t.movedFrom !== null,
    )
    if (attacker) {
      if (duel) finishDuel(duel)
      setDuel({
        id: victim.id,
        attackerId: attacker.id,
        toSquare: attacker.square,
        from: squareToWorld(attacker.movedFrom),
        to: squareToWorld(attacker.square),
        victim: squareToWorld(victim.square),
        hop: attacker.piece.type === 'n',
        attacker: null,
        victimMesh: null,
        victimBase: null,
        popped: false,
        timeline: null,
        skipRequested: false,
        done: false,
      })
      setDuelActive(true)
    }
  }
  const duelRef = useRef<DuelState | null>(null)
  useLayoutEffect(() => {
    duelRef.current = duel
  }, [duel])
  const onDuelDone = useCallback(() => setDuelActive(false), [])
  const skipDuel = useCallback(() => {
    const d = duelRef.current
    if (!d || d.done) return
    if (d.timeline) d.timeline.skip()
    else d.skipRequested = true
  }, [])

  // Captured pieces linger as "dying" meshes until their pop finishes,
  // then re-materialise in the side trays. A board reset (next puzzle,
  // new game) wipes both instead of animating a flood of captures.
  const [dying, setDying] = useState<CapturedPiece[]>([])
  const [graveyard, setGraveyard] = useState<CapturedPiece[]>([])
  useEffect(() => {
    if (bulkChange) {
      setDying([])
      setGraveyard([])
      return
    }
    if (captured.length === 0) return
    setDying((d) => {
      const have = new Set(d.map((x) => x.id))
      const add = captured.filter((c) => !have.has(c.id))
      return add.length > 0 ? [...d, ...add] : d
    })
  }, [captured, bulkChange])
  const onDeadDone = useCallback((info: CapturedPiece) => {
    setDying((d) => d.filter((x) => x.id !== info.id))
    setGraveyard((g) => (g.some((x) => x.id === info.id) ? g : [...g, info]))
  }, [])

  // Landing rings, spawned when a glide completes (castling fires two).
  const ringSeq = useRef(0)
  const [rings, setRings] = useState<Array<{ id: number; x: number; z: number }>>([])
  const onLanded = useCallback((sq: SquareName) => {
    const [x, z] = squareToWorld(sq)
    setRings((r) => [...r, { id: ringSeq.current++, x, z }])
  }, [])
  const onRingDone = useCallback(
    (id: number) => setRings((r) => r.filter((x) => x.id !== id)),
    [],
  )
  // Spark bursts where duel blades meet.
  const burstSeq = useRef(0)
  const [bursts, setBursts] = useState<
    Array<{ id: number; x: number; y: number; z: number; vel: Float32Array }>
  >([])
  const onClash = useCallback((x: number, y: number, z: number) => {
    const vel = rollSparks()
    setBursts((b) => [...b, { id: burstSeq.current++, x, y, z, vel }])
  }, [])
  const onBurstDone = useCallback(
    (id: number) => setBursts((b) => b.filter((x) => x.id !== id)),
    [],
  )
  // Flip button — each press asks the rig for another half-turn.
  const [flipSeq, setFlipSeq] = useState(0)

  const legal = useMemo(
    () => new Set(selected ? legalDestinationsFrom(selected) : []),
    [selected, legalDestinationsFrom],
  )
  const captureSquares = useMemo(() => {
    const out = new Set<SquareName>()
    for (const sq of legal) {
      const p = pieces[sq]
      if (p && p.color !== turn) out.add(sq)
    }
    return out
  }, [legal, pieces, turn])

  // Entering spell-targeting drops any move selection.
  useEffect(() => {
    if (spellPick) setSelected(null)
  }, [spellPick])

  const tap = useCallback(
    (sq: SquareName) => {
      if (spellPick) {
        if (spellPick.validTargets.has(sq)) onSpellTarget?.(sq)
        return
      }
      const piece = pieces[sq]
      if (selected) {
        if (sq === selected) { setSelected(null); return }
        if (legal.has(sq)) {
          onMove({ from: selected, to: sq, promotion: 'q' })
          setSelected(null)
          return
        }
        if (piece && piece.color === turn) { setSelected(sq); return }
        setSelected(null)
        return
      }
      if (piece && piece.color === turn) setSelected(sq)
    },
    [pieces, selected, legal, turn, onMove, spellPick, onSpellTarget],
  )

  // Arrows walk the board from the player's side (facing for
  // pass-and-play, else the side the camera opened behind).
  const kbSide: Color = facing ?? initialSide
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (selected) setAnnounce('Selection cleared')
      setSelected(null)
      setKbCursor(null)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!kbCursor) return
      e.preventDefault()
      if (spellPick) {
        setAnnounce(spellPick.validTargets.has(kbCursor) ? `${kbCursor} targeted` : `${kbCursor} is not a target`)
      } else {
        const selectedPiece = selected ? pieces[selected] ?? null : null
        setAnnounce(describeAction(kbCursor, pieces[kbCursor] ?? null, selected, selectedPiece, legal, turn))
      }
      tap(kbCursor)
      return
    }
    const next = stepCursor(kbCursor, e.key, kbSide)
    if (!next) return
    e.preventDefault()
    setKbCursor(next)
    setAnnounce(describeSquare(next, pieces[next] ?? null, legal, captureSquares))
  }

  const chip: React.CSSProperties = {
    position: 'absolute',
    zIndex: 5,
    border: 'none',
    borderRadius: 999,
    padding: '6px 12px',
    font: '600 14px system-ui, sans-serif',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  }

  return (
    <div
      className="puc-board3d"
      style={{ position: 'relative', width: '100%', height: '100%' }}
      /* The scene is a canvas, so this wrapper IS the accessible board:
       * focusable, keyboard-driven (handleKeyDown), named by the turn. */
      role="application"
      aria-label={`3D chess board, ${turn === 'w' ? 'White' : 'Black'} to move${checkSquare ? ', check' : ''}`}
      aria-describedby={hintId}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={() => setKbCursor(null)}
      /* Any tap during a duel skips it — a kid mid-game shouldn't have
       * to find the button. */
      onPointerDownCapture={duelActive ? skipDuel : undefined}
    >
    <Canvas
      shadows="soft"
      /* Camera mounts behind the viewer's side; the rig + OrbitControls
       * own it from then on (initialSide never changes mid-game). */
      camera={{ position: [0, 7.2, initialSide === 'w' ? 7.4 : -7.4], fov: 40 }}
      dpr={[1, 2]}
      style={{ touchAction: 'none' }}
    >
      {/* Provider lives INSIDE the Canvas — React context doesn't cross
        * the R3F reconciler boundary, so the scene meshes read the
        * palette from here, not from a provider outside <Canvas>. */}
      <PaletteContext.Provider value={palette}>
      <DuelContext.Provider value={duelRef}>
      {/* A dark hall around the table: solid backdrop + fog so the
        * trays and torches fade off instead of ending in mid-air. */}
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, 16, 34]} />
      <Suspense fallback={null}>
        {/* Image-based lighting (warm wooden interior, CC0 Poly Haven).
          * Own Suspense so the board paints before the 1.5 MB HDR
          * lands; lights below carry the scene until then. */}
        <Suspense fallback={null}>
          <Environment files={ENV_URL} />
        </Suspense>
        <ambientLight intensity={palette.ambient} />
        <directionalLight
          position={[6, 10, 4]}
          intensity={1.7}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0005}
          shadow-normalBias={0.02}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />
        {/* Cool rim from behind-left so piece silhouettes separate from
          * the board — the warm key alone flattened them. */}
        <directionalLight position={[-7, 6, -8]} intensity={0.9} color="#6f9be0" />
        {/* Soft golden fill from the side — toned down from the old
          * orange hearth light, which pushed the whole board red. */}
        <pointLight position={[-7, 3, 6]} intensity={11} color="#ffdcae" />

        {/* The table under everything: catches shadows, gives the fog
          * something to fade. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
          <circleGeometry args={[22, 48]} />
          <meshStandardMaterial color={palette.ground} roughness={0.95} />
        </mesh>
        {TORCHES.map(([x, z], i) => (
          <Torch key={i} x={x} z={z} phase={i * 1.7} />
        ))}

        {/* Board frame under the squares. */}
        <mesh position={[0, -0.16, 0]} receiveShadow>
          <boxGeometry args={[FRAME_SIZE, 0.12, FRAME_SIZE]} />
          <meshStandardMaterial
            key={wood ? 'wood' : 'flat'}
            map={wood}
            color={palette.frame}
            roughness={0.85}
            envMapIntensity={0.55}
          />
        </mesh>
        <BoardCoords />

        {/* Capture trays flanking the board — fallen pieces line up
          * here, doubling as a who's-ahead-on-material reminder. */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[0, -0.08, s * 5.5]} receiveShadow>
            <boxGeometry args={[5.7, 0.1, 1.7]} />
            <meshStandardMaterial
              key={wood ? 'wood' : 'flat'}
              map={wood}
              color={palette.frame}
              roughness={0.85}
              envMapIntensity={0.55}
            />
          </mesh>
        ))}

        <Squares
          selected={selected}
          legal={legal}
          capture={captureSquares}
          lastMove={lastMove}
          checkSquare={checkSquare}
          spellTargets={spellPick ? spellPick.validTargets : null}
          firstPick={spellPick?.firstPick ?? null}
          wood={wood}
          onTap={tap}
        />
        {kbCursor && <CursorFrame sq={kbCursor} />}

        {/* Status-effect badges floating above affected squares. */}
        {badges &&
          (Object.entries(badges) as Array<[SquareName, string]>).map(([sq, text]) => {
            if (!text) return null
            const [bx, bz] = squareToWorld(sq)
            return (
              <Html
                key={sq}
                position={[bx, 1.25, bz]}
                center
                distanceFactor={9}
                zIndexRange={[10, 0]}
                style={{ pointerEvents: 'none', fontSize: 22, whiteSpace: 'nowrap' }}
              >
                {text}
              </Html>
            )
          })}
        <Suspense
          fallback={
            <PiecesProcedural
              tracked={tracked}
              dying={dying}
              graveyard={graveyard}
              selected={selected}
              checkSquare={checkSquare}
              onTap={tap}
              onLanded={onLanded}
              onDeadDone={onDeadDone}
            />
          }
        >
          <PiecesGltf
            tracked={tracked}
            dying={dying}
            graveyard={graveyard}
            selected={selected}
            checkSquare={checkSquare}
            onTap={tap}
            onLanded={onLanded}
            onDeadDone={onDeadDone}
          />
        </Suspense>

        {rings.map((r) => (
          <RingPulse key={r.id} id={r.id} x={r.x} z={r.z} onDone={onRingDone} />
        ))}
        {bursts.map((b) => (
          <SparkBurst key={b.id} id={b.id} x={b.x} y={b.y} z={b.z} vel={b.vel} onDone={onBurstDone} />
        ))}
        {duel && duelActive && (
          <DuelRunner key={duel.id} onClash={onClash} onLanded={onLanded} onDone={onDuelDone} />
        )}

        <CameraRig facing={facing} flipSeq={flipSeq} />
      </Suspense>
      </DuelContext.Provider>
      </PaletteContext.Provider>
    </Canvas>
    <div className="puc-board3d__sr" role="status" aria-live="polite" aria-atomic="true">{announce}</div>
    <span id={hintId} className="puc-board3d__sr">Arrow keys move the cursor, Enter selects or moves, Escape clears.</span>
    {/* Ada's look-picker — flips the 3D set between the realistic
      * wooden pieces and the colourful blue board. */}
    <button
      type="button"
      onClick={togglePalette}
      aria-pressed={paletteName === 'candy'}
      title={paletteName === 'candy' ? 'Switch to the wooden set' : 'Switch to the blue board'}
      style={{
        ...chip,
        top: 10,
        right: 10,
        background: paletteName === 'candy' ? 'rgba(47,59,82,0.92)' : 'rgba(123,89,52,0.9)',
      }}
    >
      {paletteName === 'candy' ? '🟦 Blue' : '🪵 Wood'}
    </button>
    <button
      type="button"
      onClick={() => setFlipSeq((n) => n + 1)}
      title="Swing the camera round to the other side"
      style={{ ...chip, top: 10, left: 10, background: 'rgba(40,40,48,0.85)' }}
    >
      ↻ Flip
    </button>
    {duelActive && (
      <button
        type="button"
        onClick={skipDuel}
        title="Skip the duel"
        style={{
          ...chip,
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(40,40,48,0.85)',
        }}
      >
        ⏭ Skip
      </button>
    )}
    </div>
  )
}
