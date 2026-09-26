// Effects — one-shot fx spawned from sim events, pooled and capped at
// ~40 live: Board3D's SparkBurst / RingPulse where they fit, plus the
// siege-only ones — the kill pop, the boss topple, coloured pulse rings,
// spell bolts, castling arcs and the stun puff. Spawning is the only
// React state on the hot path, and it changes only when an event lands.
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { RingPulse, SparkBurst, rollSparks } from '../../../board3d/fx'
import { pieceGeometries } from '../../../board3d/pieceGeometry'
import type { PieceSymbol } from '../../../chess/types'
import type { Sim, SimEvent } from '../sim/types'
import { cellX, cellZ, EBONY, ENEMY_SCALE, enemyScale, findGates, findTower, isBossId, posX, posZ, symbolFor } from './world'

export interface FxHandle {
  consume(events: SimEvent[]): void
}

type FxItem =
  | { kind: 'spark'; id: number; x: number; y: number; z: number; vel: Float32Array }
  | { kind: 'gold'; id: number; x: number; z: number }
  | { kind: 'pop'; id: number; x: number; z: number; sym: PieceSymbol; scale: number }
  | { kind: 'topple'; id: number; x: number; z: number; sym: PieceSymbol; scale: number }
  | { kind: 'ring'; id: number; x: number; z: number; color: string; r0: number; r1: number; dur: number }
  | { kind: 'bolt'; id: number; x: number; z: number; delay: number }
  | { kind: 'arc'; id: number; ax: number; az: number; bx: number; bz: number; height: number; color: string }
  | { kind: 'puff'; id: number; x: number; z: number }

type Item<K extends FxItem['kind']> = Extract<FxItem, { kind: K }>
type Done = (id: number) => void

const CAP = 40
let seq = 0

/** Velocities from rollSparks() scaled — half for a hit, bigger for a boss. */
function sparks(mult: number): Float32Array {
  const vel = rollSparks()
  for (let i = 0; i < vel.length; i++) vel[i] = (vel[i] ?? 0) * mult
  return vel
}

export function Effects({ sim, handle }: { sim: Sim; handle: RefObject<FxHandle | null> }) {
  const [live, setLive] = useState<FxItem[]>([])
  const remove = useCallback<Done>((id) => setLive((l) => l.filter((f) => f.id !== id)), [])
  const { cols, rows } = sim.map
  const goal = useMemo(() => findGates(sim.map).goal, [sim.map])

  useImperativeHandle(
    handle,
    () => ({
      consume(events) {
        const add: FxItem[] = []
        const gx = cellX(goal.c, cols)
        const gz = cellZ(goal.r, rows)
        for (const ev of events) {
          switch (ev.kind) {
            case 'hit':
              add.push({ kind: 'spark', id: seq++, x: posX(ev.at.x, cols), y: 0.35, z: posZ(ev.at.y, rows), vel: sparks(0.5) })
              break
            case 'kill': {
              // A defeated boss topples instead (bossDefeat, below).
              const toppling = isBossId(ev.type) && events.some((e) => e.kind === 'bossDefeat' && Math.abs(e.at.x - ev.at.x) < 0.01 && Math.abs(e.at.y - ev.at.y) < 0.01)
              if (toppling) break
              add.push({ kind: 'pop', id: seq++, x: posX(ev.at.x, cols), z: posZ(ev.at.y, rows), sym: symbolFor(ev.type), scale: ENEMY_SCALE * enemyScale(ev.type) })
              break
            }
            case 'bossDefeat':
              add.push({ kind: 'topple', id: seq++, x: posX(ev.at.x, cols), z: posZ(ev.at.y, rows), sym: symbolFor(ev.boss), scale: ENEMY_SCALE * enemyScale(ev.boss) })
              break
            case 'leak':
              add.push({ kind: 'ring', id: seq++, x: gx, z: gz, color: '#ff3b3b', r0: 0.3, r1: 1.4, dur: 0.6 })
              break
            case 'waveClear':
              add.push({ kind: 'gold', id: seq++, x: gx, z: gz })
              break
            case 'build':
              add.push({ kind: 'ring', id: seq++, x: cellX(ev.cell.c, cols), z: cellZ(ev.cell.r, rows), color: '#fff2c8', r0: 0.2, r1: 0.55, dur: 0.4 })
              break
            case 'spell': {
              const x = cellX(ev.at.c, cols)
              const z = cellZ(ev.at.r, rows)
              if (ev.spell === 'fork') {
                add.push({ kind: 'bolt', id: seq++, x: x - 0.45, z, delay: 0 }, { kind: 'bolt', id: seq++, x: x + 0.45, z, delay: 0.12 })
              } else if (ev.spell === 'pin') {
                add.push({ kind: 'ring', id: seq++, x, z, color: '#9fd8ff', r0: 0.4, r1: 1.7, dur: 0.8 })
              }
              break
            }
            case 'castling': {
              const ax = cellX(ev.a.c, cols)
              const az = cellZ(ev.a.r, rows)
              const bx = cellX(ev.b.c, cols)
              const bz = cellZ(ev.b.r, rows)
              add.push(
                { kind: 'arc', id: seq++, ax, az, bx, bz, height: 1.4, color: '#f1c34c' },
                { kind: 'arc', id: seq++, ax: bx, az: bz, bx: ax, bz: az, height: 1.0, color: '#efe3c4' },
              )
              break
            }
            case 'stun': {
              const t = findTower(sim.state, ev.towerId)
              if (t) add.push({ kind: 'puff', id: seq++, x: cellX(t.cell.c, cols), z: cellZ(t.cell.r, rows) })
              break
            }
            default:
              break
          }
        }
        if (add.length === 0) return
        setLive((l) => {
          // Over the cap, hit sparks are the first to go.
          let room = CAP - l.length
          const kept: FxItem[] = []
          for (const f of add) {
            if (f.kind !== 'spark') {
              kept.push(f)
              room--
            }
          }
          for (const f of add) {
            if (f.kind === 'spark' && room > 0) {
              kept.push(f)
              room--
            }
          }
          return kept.length > 0 ? [...l, ...kept] : l
        })
      },
    }),
    [sim, goal, cols, rows],
  )

  return (
    <group>
      {live.map((f) => {
        switch (f.kind) {
          case 'spark':
            return <SparkBurst key={f.id} id={f.id} x={f.x} y={f.y} z={f.z} vel={f.vel} onDone={remove} />
          case 'gold':
            return <RingPulse key={f.id} id={f.id} x={f.x} z={f.z} onDone={remove} />
          case 'pop':
            return <PopFx key={f.id} item={f} onDone={remove} />
          case 'topple':
            return <ToppleFx key={f.id} item={f} onDone={remove} />
          case 'ring':
            return <PulseRing key={f.id} item={f} onDone={remove} />
          case 'bolt':
            return <BoltFx key={f.id} item={f} onDone={remove} />
          case 'arc':
            return <ArcFx key={f.id} item={f} onDone={remove} />
          case 'puff':
            return <PuffFx key={f.id} item={f} onDone={remove} />
          default:
            return null
        }
      })}
    </group>
  )
}

const POP_DUR = 0.38
const POP_LINGER = 0.5
/** Board3D's DyingPiece curve: a quick swell, then collapse. */
function popScale(p: number): number {
  return p < 0.35 ? 1 + 0.18 * (p / 0.35) : Math.max(0, 1.18 * (1 - (p - 0.35) / 0.65))
}

const BLACK_PIECE = { color: EBONY, roughness: 0.45, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 } as const

/** A black piece pops where an enemy fell — swells, vanishes, sparkles. */
function PopFx({ item, onDone }: { item: Item<'pop'>; onDone: Done }) {
  const geo = useMemo(() => pieceGeometries()[item.sym], [item.sym])
  const mesh = useRef<THREE.Mesh>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const m = mesh.current
    if (m) {
      const s = popScale(Math.min(1, life.current / POP_DUR))
      m.scale.setScalar(s * item.scale)
      m.visible = s > 0.001
    }
    if (life.current >= POP_DUR + POP_LINGER && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <group position={[item.x, 0, item.z]}>
      <mesh ref={mesh} geometry={geo} scale={item.scale} castShadow dispose={null}>
        <meshPhysicalMaterial {...BLACK_PIECE} />
      </mesh>
      <Sparkles position={[0, 0.45 * item.scale, 0]} count={18} scale={1} size={5} speed={1.4} color="#ffd95e" />
    </group>
  )
}

const TOPPLE_DUR = 1.2
const noop = () => {}

/** The beaten boss resigns: it keels over slowly (pivoting on the front
 *  edge of its base), then pops in a big burst. No gore — the same rule
 *  as the 3D board. */
function ToppleFx({ item, onDone }: { item: Item<'topple'>; onDone: Done }) {
  const geo = useMemo(() => pieceGeometries()[item.sym], [item.sym])
  const pivot = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const life = useRef(0)
  const done = useRef(false)
  const [burst, setBurst] = useState<Float32Array | null>(null)
  const edge = 0.3 * item.scale
  useFrame((_, dt) => {
    life.current += dt
    const t = life.current
    if (t < TOPPLE_DUR) {
      const p = t / TOPPLE_DUR
      if (pivot.current) pivot.current.rotation.x = (Math.PI / 2) * p * p
      return
    }
    if (!burst) setBurst(sparks(1.6))
    const m = mesh.current
    if (m) {
      const s = popScale(Math.min(1, (t - TOPPLE_DUR) / POP_DUR))
      m.scale.setScalar(s * item.scale)
      m.visible = s > 0.001
    }
    if (t >= TOPPLE_DUR + POP_DUR + POP_LINGER && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <group>
      <group ref={pivot} position={[item.x, 0, item.z + edge]}>
        <mesh ref={mesh} geometry={geo} position={[0, 0, -edge]} scale={item.scale} castShadow dispose={null}>
          <meshPhysicalMaterial {...BLACK_PIECE} />
        </mesh>
      </group>
      {burst && (
        <>
          <SparkBurst id={0} x={item.x} y={0.3} z={item.z + edge} vel={burst} onDone={noop} />
          <Sparkles position={[item.x, 0.5, item.z + edge]} count={40} scale={2} size={7} speed={1.6} color="#ffd95e" />
        </>
      )}
    </group>
  )
}

/** A coloured ring expanding from r0 to r1 while it fades. */
function PulseRing({ item, onDone }: { item: Item<'ring'>; onDone: Done }) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const p = Math.min(1, life.current / item.dur)
    const r = item.r0 + (item.r1 - item.r0) * p
    if (mesh.current) mesh.current.scale.set(r, r, 1)
    if (mat.current) mat.current.opacity = 0.8 * (1 - p)
    if (p >= 1 && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <mesh ref={mesh} position={[item.x, 0.02, item.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[item.r0, item.r0, 1]}>
      <ringGeometry args={[0.86, 1, 48]} />
      <meshBasicMaterial ref={mat} color={item.color} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

const BOLT_DUR = 0.28

/** A bright shaft striking the cell from above (Fork fires two). */
function BoltFx({ item, onDone }: { item: Item<'bolt'>; onDone: Done }) {
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const life = useRef(-item.delay)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const t = life.current
    const g = group.current
    if (g) g.visible = t >= 0
    if (t < 0) return
    const p = Math.min(1, t / BOLT_DUR)
    if (mat.current) mat.current.opacity = 1 - p
    if (g) g.scale.set(1 + p * 0.6, 1, 1 + p * 0.6)
    if (p >= 1 && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <group ref={group} visible={false} position={[item.x, 0, item.z]}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.05, 0.09, 3.2, 8]} />
        <meshBasicMaterial ref={mat} color="#dff3ff" transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

const ARC_DUR = 0.7

/** A glowing arc between two cells (castling draws one each way). */
function ArcFx({ item, onDone }: { item: Item<'arc'>; onDone: Done }) {
  const geo = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(item.ax, 0.3, item.az),
      new THREE.Vector3((item.ax + item.bx) / 2, item.height, (item.az + item.bz) / 2),
      new THREE.Vector3(item.bx, 0.3, item.bz),
    )
    return new THREE.TubeGeometry(curve, 24, 0.035, 6, false)
  }, [item])
  useEffect(() => () => geo.dispose(), [geo])
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const p = Math.min(1, life.current / ARC_DUR)
    if (mat.current) mat.current.opacity = 0.9 * (1 - p)
    if (p >= 1 && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial ref={mat} color={item.color} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const PUFF_DUR = 0.45

/** A blue puff swelling off a stunned tower. */
function PuffFx({ item, onDone }: { item: Item<'puff'>; onDone: Done }) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const p = Math.min(1, life.current / PUFF_DUR)
    if (mesh.current) mesh.current.scale.setScalar(0.2 + 0.8 * p)
    if (mat.current) mat.current.opacity = 0.7 * (1 - p)
    if (p >= 1 && !done.current) {
      done.current = true
      onDone(item.id)
    }
  })
  return (
    <mesh ref={mesh} position={[item.x, 0.5, item.z]} scale={0.2}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshBasicMaterial ref={mat} color="#5ec8ff" transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
