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

import { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Color, MoveInput, Piece as PieceModel, PieceSymbol, Square as SquareName } from '../chess/types'
import { FILES, RANKS, squareColor, type File, type Rank } from '../board/squares'
import { pieceGeometries } from './pieceGeometry'
import { useGltfPieceGeometries } from './gltfPieces'
import { usePieceTracking, type TrackedPiece } from './usePieceTracking'

export interface Board3DProps {
  pieces: Partial<Record<SquareName, PieceModel>>
  turn: Color
  legalDestinationsFrom: (from: SquareName) => SquareName[]
  onMove: (move: MoveInput) => void
  lastMove?: { from: SquareName; to: SquareName } | null
  checkSquare?: SquareName | null
}

/** Board-square (file, rank) → world x/z. Board is centred on the
 *  origin, one square = 1 world unit, +z toward White's side. */
function squareToWorld(sq: SquareName): [number, number] {
  const fileIdx = FILES.indexOf(sq[0] as File)
  const rankIdx = RANKS.indexOf(sq[1] as Rank)
  return [fileIdx - 3.5, 3.5 - rankIdx]
}

const SQUARE_LIGHT = '#e8d3a8'
const SQUARE_DARK = '#7a5a36'
const PIECE_WHITE = '#f3e6c8'
const PIECE_BLACK = '#3a2a20'
const TINT_SELECTED = '#f1c34c'
const TINT_LEGAL = '#7cc28b'
const TINT_CAPTURE = '#ef8a5a'
const TINT_LASTMOVE = '#b9a3ff'
const TINT_CHECK = '#e05a4a'

function Squares({
  selected,
  legal,
  capture,
  lastMove,
  checkSquare,
  onTap,
}: {
  selected: SquareName | null
  legal: ReadonlySet<SquareName>
  capture: ReadonlySet<SquareName>
  lastMove: { from: SquareName; to: SquareName } | null
  checkSquare: SquareName | null
  onTap: (sq: SquareName) => void
}) {
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
        else if (selected === sq) tint = TINT_SELECTED
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
            <meshStandardMaterial
              color={dark ? SQUARE_DARK : SQUARE_LIGHT}
              emissive={tint ?? '#000000'}
              emissiveIntensity={tint ? 0.55 : 0}
              roughness={0.85}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/** One persistent mesh per tracked piece. Position tweens toward the
 *  target square every frame, so a piece that just moved (movedFrom
 *  set) glides there — including into a capture square. */
function AnimatedPiece({
  tracked,
  geometry,
  scale,
  isSelected,
  onTap,
}: {
  tracked: TrackedPiece
  geometry: THREE.BufferGeometry
  scale: number
  isSelected: boolean
  onTap: (sq: SquareName) => void
}) {
  const ref = useRef<THREE.Mesh>(null)
  const [tx, tz] = squareToWorld(tracked.square)
  // Initialise at the FROM square when this render is a move, so the
  // glide starts visually where the piece stood.
  const start = tracked.movedFrom ? squareToWorld(tracked.movedFrom) : [tx, tz]
  const initial = useRef<[number, number]>(start as [number, number])

  useFrame((_, delta) => {
    const m = ref.current
    if (!m) return
    const targetY = isSelected ? 0.12 : 0
    // Exponential ease toward the target — frame-rate independent.
    const k = 1 - Math.exp(-delta * 10)
    m.position.x += (tx - m.position.x) * k
    m.position.z += (tz - m.position.z) * k
    m.position.y += (targetY - m.position.y) * k
  })

  return (
    <mesh
      ref={ref}
      geometry={geometry}
      position={[initial.current[0], 0, initial.current[1]]}
      rotation={[0, tracked.piece.color === 'b' ? Math.PI : 0, 0]}
      scale={scale}
      castShadow
      onClick={(e) => { e.stopPropagation(); onTap(tracked.square) }}
      /* Geometries are shared module-level caches — never let R3F
       * dispose them when one piece unmounts (capture). */
      dispose={null}
    >
      <meshStandardMaterial
        color={tracked.piece.color === 'w' ? PIECE_WHITE : PIECE_BLACK}
        emissive={isSelected ? TINT_SELECTED : '#000000'}
        emissiveIntensity={isSelected ? 0.35 : 0}
        roughness={0.55}
        metalness={0.08}
      />
    </mesh>
  )
}

function PiecesInner({
  tracked,
  geos,
  scale,
  selected,
  onTap,
}: {
  tracked: TrackedPiece[]
  geos: Record<PieceSymbol, THREE.BufferGeometry>
  scale: number
  selected: SquareName | null
  onTap: (sq: SquareName) => void
}) {
  return (
    <group>
      {tracked.map((t) => (
        <AnimatedPiece
          key={t.id}
          tracked={t}
          geometry={geos[t.piece.type]}
          scale={scale}
          isSelected={selected === t.square}
          onTap={onTap}
        />
      ))}
    </group>
  )
}

/** GLTF-model pieces (Sketchfab set — see public/models3d/CREDITS.md).
 *  Suspends while the six models download. */
function PiecesGltf(props: {
  tracked: TrackedPiece[]
  selected: SquareName | null
  onTap: (sq: SquareName) => void
}) {
  const geos = useGltfPieceGeometries()
  return <PiecesInner geos={geos} scale={1} {...props} />
}

/** Procedural low-poly pieces — instant, used as the Suspense
 *  fallback while the GLTF set streams in. */
function PiecesProcedural(props: {
  tracked: TrackedPiece[]
  selected: SquareName | null
  onTap: (sq: SquareName) => void
}) {
  const geos = useMemo(() => pieceGeometries(), [])
  return <PiecesInner geos={geos} scale={1.25} {...props} />
}

export function Board3D({
  pieces,
  turn,
  legalDestinationsFrom,
  onMove,
  lastMove = null,
  checkSquare = null,
}: Board3DProps) {
  const [selected, setSelected] = useState<SquareName | null>(null)
  // Stable per-piece identity + movedFrom diffs — drives one
  // persistent animated mesh per piece.
  const tracked = usePieceTracking(pieces)

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

  const tap = useCallback(
    (sq: SquareName) => {
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
    [pieces, selected, legal, turn, onMove],
  )

  return (
    <Canvas
      shadows
      camera={{ position: [0, 7.2, 7.4], fov: 40 }}
      dpr={[1, 2]}
      style={{ touchAction: 'none' }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[6, 10, 4]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        {/* Warm hearth fill from the side — ties into the castle look. */}
        <pointLight position={[-7, 3, 6]} intensity={18} color="#ffb060" />

        {/* Board frame under the squares. */}
        <mesh position={[0, -0.16, 0]} receiveShadow>
          <boxGeometry args={[9.2, 0.12, 9.2]} />
          <meshStandardMaterial color="#4a3018" roughness={0.9} />
        </mesh>

        <Squares
          selected={selected}
          legal={legal}
          capture={captureSquares}
          lastMove={lastMove}
          checkSquare={checkSquare}
          onTap={tap}
        />
        <Suspense
          fallback={<PiecesProcedural tracked={tracked} selected={selected} onTap={tap} />}
        >
          <PiecesGltf tracked={tracked} selected={selected} onTap={tap} />
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={16}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Suspense>
    </Canvas>
  )
}
