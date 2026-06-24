// Board3D — three.js (react-three-fiber) renderer implementing the
// same view-protocol as the 2D Board component: pieces / turn /
// legalDestinationsFrom / onMove / lastMove / checkSquare. All chess
// legality lives with the caller; this is purely an alternate view.
//
// Interaction model: tap a piece's square, legal destinations light
// up, tap one to move (mirrors the 2D click flow — no 3D dragging,
// which is miserable on touch). Promotion auto-queens, same as 2D.
//
// The camera orbits freely (OrbitControls) and stays wherever the
// player leaves it — no automatic re-orientation between turns.
//
// Move/capture choreography (all cosmetic — chess.js already decided):
//   - movers tween square→square over MOVE_DUR with cubic ease;
//     knights hop a parabolic arc
//   - the landing square flashes an expanding golden ring
//   - a captured piece stands its ground until the attacker lands,
//     then pops (scale up → gone) in a burst of sparkles
// Move/capture SOUNDS stay with the screens (they already play
// 'move'/'capture'/'check' at move time) — none here, or they'd double.

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Html, OrbitControls, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import type { Color, MoveInput, Piece as PieceModel, PieceSymbol, Square as SquareName } from '../chess/types'
import { FILES, RANKS, squareColor, type File, type Rank } from '../board/squares'
import { pieceGeometries } from './pieceGeometry'
import { useGltfPieceAssets } from './gltfPieces'
import { usePieceTracking, type CapturedPiece, type TrackedPiece } from './usePieceTracking'

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
}

const PALETTES: Record<Palette3dName, Palette3d> = {
  wood: {
    texturedBoard: true,
    texturedPieces: true,
    squareLight: new THREE.Color(2.4, 2.42, 2.42),
    squareDark: new THREE.Color(1.18, 1.06, 0.92),
    frame: new THREE.Color(0.92, 0.8, 0.64),
    white: new THREE.Color(2.0, 1.88, 1.66),
    black: new THREE.Color(1.55, 1.32, 1.12),
    ambient: 0.42,
    clearcoat: 0.7,
  },
  // Cream + deep-blue board, ivory vs navy pieces. No pink anywhere.
  candy: {
    texturedBoard: false,
    texturedPieces: false,
    squareLight: '#ecdfc4',  // warm cream
    squareDark: '#4f86b5',   // deep blue (toned down from the pale glary one)
    frame: '#2f3b52',        // dark slate-blue rail
    white: '#f5eede',        // bright ivory — pops on the blue squares
    black: '#2b3340',        // deep navy charcoal — reads on blue and cream
    ambient: 0.52,
    clearcoat: 0.4,
  },
}

const PaletteContext = createContext<Palette3d>(PALETTES.wood)
const usePalette = () => useContext(PaletteContext)

/** Untextured pieces (candy mode, or the procedural fallback before the
 *  GLTF set lands) take the flat colour; textured wood pieces multiply
 *  the map by it. Same colour key either way. */
function pieceTint(color: Color, palette: Palette3d): THREE.ColorRepresentation {
  return color === 'w' ? palette.white : palette.black
}

const PALETTE_KEY = 'puc.board3d.palette'
function readPalette(): Palette3dName {
  try {
    // 'classic' is a legacy key from the brief green-board version.
    const v = localStorage.getItem(PALETTE_KEY)
    return v === 'candy' || v === 'classic' ? 'candy' : 'wood'
  } catch {
    return 'wood'
  }
}
const TINT_SELECTED = '#f1c34c'
const TINT_LEGAL = '#7cc28b'
const TINT_CAPTURE = '#ef8a5a'
const TINT_LASTMOVE = '#b9a3ff'
const TINT_CHECK = '#e05a4a'
const TINT_SPELL = '#a06bff'

const ENV_URL = '/models3d/env/st_fagans_interior_1k.hdr'
const WOOD_URL = '/models3d/env/wood.jpg'

const MOVE_DUR = 0.45
const HOP_HEIGHT = 0.8
const POP_DUR = 0.38
/** Sparkles keep twinkling this long after the pop finishes. */
const POP_LINGER = 0.5
const RING_DUR = 0.5
/** Captured pieces re-materialise at this size in the side trays. */
const GRAVE_SCALE = 0.5
const GRAVE_IN_DUR = 0.35

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

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

  return (
    <group>
      {cells.map(({ sq, x, z, dark }) => {
        let tint: string | null = null
        if (checkSquare === sq) tint = TINT_CHECK
        else if (firstPick === sq) tint = TINT_SELECTED
        else if (selected === sq) tint = TINT_SELECTED
        else if (spellTargets?.has(sq)) tint = TINT_SPELL
        else if (capture.has(sq)) tint = TINT_CAPTURE
        else if (legal.has(sq)) tint = TINT_LEGAL
        else if (lastMove && (lastMove.from === sq || lastMove.to === sq)) tint = TINT_LASTMOVE
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
              map={wood}
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

/** Expanding golden ring on the square a piece just landed on. */
function RingPulse({
  id,
  x,
  z,
  onDone,
}: {
  id: number
  x: number
  z: number
  onDone: (id: number) => void
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, delta) => {
    life.current += delta
    const p = Math.min(1, life.current / RING_DUR)
    if (mesh.current) {
      const s = 0.45 + 1.05 * p
      mesh.current.scale.set(s, s, 1)
    }
    if (mat.current) mat.current.opacity = 0.75 * (1 - p)
    if (p >= 1 && !done.current) {
      done.current = true
      onDone(id)
    }
  })
  return (
    <mesh ref={mesh} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.36, 0.46, 40]} />
      <meshBasicMaterial
        ref={mat}
        color="#f7cf5e"
        transparent
        opacity={0.75}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

interface MoveAnim {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
  t: number
  hop: boolean
}

/** One persistent mesh per tracked piece. A move starts an explicit
 *  0→1 tween (knights arc over the board); when it completes the
 *  parent gets onLanded() to flash the landing ring. Position is
 *  imperative-only — NEVER a reactive prop, or every re-render would
 *  teleport long-since-moved pieces back to their mount square. */
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
    anim.current = { fromX: fx, fromZ: fz, toX: tx, toZ: tz, t: 0, hop: tracked.piece.type === 'n' }
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
        anim.current = { fromX: fx, fromZ: fz, toX: sx, toZ: sz, t: 0, hop: tracked.piece.type === 'n' }
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
      a.t = Math.min(1, a.t + delta / MOVE_DUR)
      const e = easeInOutCubic(a.t)
      m.position.x = a.fromX + (a.toX - a.fromX) * e
      m.position.z = a.fromZ + (a.toZ - a.fromZ) * e
      m.position.y = a.hop ? HOP_HEIGHT * 4 * e * (1 - e) : 0
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

/** A captured piece's last moment: it stands its ground while the
 *  attacker glides in (MOVE_DUR), then pops — a quick swell and
 *  collapse inside a burst of sparkles. */
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
  const ref = useRef<THREE.Mesh>(null)
  const life = useRef(0)
  const done = useRef(false)
  const [sparkling, setSparkling] = useState(false)
  const [x, z] = squareToWorld(info.square)

  useFrame((_, delta) => {
    life.current += delta
    const t = life.current - MOVE_DUR
    if (t <= 0) return
    if (!sparkling) setSparkling(true)
    const m = ref.current
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  spellPick = null,
  onSpellTarget,
  badges,
}: Board3DProps) {
  const [selected, setSelected] = useState<SquareName | null>(null)
  // The chosen 3D look (wood / candy). Persisted so Ada's pick sticks
  // across screens and sessions.
  const [paletteName, setPaletteName] = useState<Palette3dName>(readPalette)
  const palette = PALETTES[paletteName]
  const togglePalette = useCallback(() => {
    setPaletteName((p) => {
      const next: Palette3dName = p === 'candy' ? 'wood' : 'candy'
      try { localStorage.setItem(PALETTE_KEY, next) } catch { /* private mode */ }
      return next
    })
  }, [])
  // Stable per-piece identity + movedFrom/captured diffs — drives one
  // persistent animated mesh per piece.
  const { tracked, captured, bulkChange } = usePieceTracking(pieces)
  const woodTex = useWoodTexture()
  // Candy mode renders flat (untextured) board + frame.
  const wood = palette.texturedBoard ? woodTex : null

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <Canvas
      shadows="soft"
      /* Camera mounts behind the viewer's side; OrbitControls owns it
       * from then on (initialSide never changes mid-game). */
      camera={{ position: [0, 7.2, initialSide === 'w' ? 7.4 : -7.4], fov: 40 }}
      dpr={[1, 2]}
      style={{ touchAction: 'none' }}
    >
      {/* Provider lives INSIDE the Canvas — React context doesn't cross
        * the R3F reconciler boundary, so the scene meshes read the
        * palette from here, not from a provider outside <Canvas>. */}
      <PaletteContext.Provider value={palette}>
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
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.0005}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />
        {/* Soft golden fill from the side — toned down from the old
          * orange hearth light, which pushed the whole board red. */}
        <pointLight position={[-7, 3, 6]} intensity={11} color="#ffdcae" />

        {/* Board frame under the squares. */}
        <mesh position={[0, -0.16, 0]} receiveShadow>
          <boxGeometry args={[9.2, 0.12, 9.2]} />
          <meshStandardMaterial
            key={wood ? 'wood' : 'flat'}
            map={wood}
            color={palette.frame}
            roughness={0.85}
            envMapIntensity={0.55}
          />
        </mesh>

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

        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={16}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Suspense>
      </PaletteContext.Provider>
    </Canvas>
    {/* Ada's look-picker — flips the 3D set between the realistic
      * wooden pieces and the colourful blue board. */}
    <button
      type="button"
      onClick={togglePalette}
      aria-pressed={paletteName === 'candy'}
      title={paletteName === 'candy' ? 'Switch to the wooden set' : 'Switch to the blue board'}
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 5,
        border: 'none',
        borderRadius: 999,
        padding: '6px 12px',
        font: '600 14px system-ui, sans-serif',
        color: '#fff',
        cursor: 'pointer',
        background: paletteName === 'candy' ? 'rgba(47,59,82,0.92)' : 'rgba(123,89,52,0.9)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      {paletteName === 'candy' ? '🟦 Blue' : '🪵 Wood'}
    </button>
    </div>
  )
}
