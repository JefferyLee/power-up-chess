// Enemies — the black army as one InstancedMesh per piece type (matrix
// from pos/dir, colour = ebony / hit flash / slowed / frozen / burning),
// bosses as individual crowned meshes, and billboarded health bars over
// every enemy (two InstancedMeshes: dark back + coloured fill).
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pieceGeometries } from '../../../board3d/pieceGeometry'
import type { BossId, EnemyState, EnemyType, Sim } from '../sim/types'
import { EBONY, ENEMY_SCALE, enemyScale, findEnemy, PIECE_SYM, PIECE_TOP, posX, posZ, symbolFor } from './world'

const TYPES: EnemyType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen']
const TYPE_INDEX: Record<EnemyType, number> = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4 }
const MAX = 300
const FLASH = 0.08
const BAR_W = 0.55
const BAR_H = 0.07
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const EBONY_C = new THREE.Color(EBONY)
const FLASH_C = new THREE.Color('#ffffff')
const SLOW_C = new THREE.Color('#3a4a8a')
const FROZEN_C = new THREE.Color('#9fd8ff')
const BURN_C = new THREE.Color('#d0521a')
/** Per-type instance counts for the frame in progress (scratch). */
const counts = new Int32Array(TYPES.length)

function tintFor(e: EnemyState, time: number): THREE.Color {
  if (time - e.hitAt < FLASH) return FLASH_C
  if (e.frozenUntil > time) return FROZEN_C
  if (e.burnUntil > time) return BURN_C
  if (e.slowUntil > time) return SLOW_C
  return EBONY_C
}

interface BossSnap {
  id: number
  type: BossId
  decoy: boolean
}

export function Enemies({ sim }: { sim: Sim }) {
  const { cols, rows } = sim.map
  const geos = useMemo(() => pieceGeometries(), [])
  const meshes = useRef<Array<THREE.InstancedMesh | null>>([null, null, null, null, null])
  const back = useRef<THREE.InstancedMesh>(null)
  const fill = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      c: new THREE.Color(),
      right: new THREE.Vector3(),
      toCam: new THREE.Vector3(),
    }),
    [],
  )
  const [bosses, setBosses] = useState<BossSnap[]>([])
  const bossRef = useRef(bosses)

  useFrame(({ camera }) => {
    const st = sim.state
    const { m, p, q, s, c, right, toCam } = tmp
    counts.fill(0)
    let bossCount = 0
    let bossChanged = false
    for (const e of st.enemies) {
      if (e.boss) {
        const snap = bossRef.current[bossCount++]
        if (!snap || snap.id !== e.id || snap.decoy !== e.decoy) bossChanged = true
        continue
      }
      const ti = TYPE_INDEX[e.type as EnemyType]
      const mesh = meshes.current[ti]
      if (ti === undefined || !mesh) continue
      const i = counts[ti] ?? 0
      if (i >= MAX) continue
      counts[ti] = i + 1
      p.set(posX(e.pos.x, cols), 0, posZ(e.pos.y, rows))
      q.setFromAxisAngle(Y_AXIS, Math.atan2(e.dir.x, e.dir.y))
      s.setScalar(ENEMY_SCALE * enemyScale(e.type))
      mesh.setMatrixAt(i, m.compose(p, q, s))
      mesh.setColorAt(i, tintFor(e, st.time))
    }
    for (let ti = 0; ti < TYPES.length; ti++) {
      const mesh = meshes.current[ti]
      if (!mesh) continue
      mesh.count = counts[ti] ?? 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (bossChanged || bossCount !== bossRef.current.length) {
      bossRef.current = st.enemies.filter((e) => e.boss).map((e) => ({ id: e.id, type: e.type as BossId, decoy: e.decoy }))
      setBosses(bossRef.current)
    }

    // Health bars: camera-facing quads, the fill anchored to the left edge.
    const b = back.current
    const f = fill.current
    if (!b || !f) return
    q.copy(camera.quaternion)
    right.set(1, 0, 0).applyQuaternion(q)
    toCam.set(0, 0, 1).applyQuaternion(q)
    let n = 0
    for (const e of st.enemies) {
      if (n >= MAX) break
      const scale = ENEMY_SCALE * enemyScale(e.type)
      const w = e.boss ? BAR_W * 1.6 : BAR_W
      p.set(posX(e.pos.x, cols), PIECE_TOP[symbolFor(e.type)] * scale + 0.16, posZ(e.pos.y, rows))
      s.set(w, BAR_H, 1)
      b.setMatrixAt(n, m.compose(p, q, s))
      const frac = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0
      p.addScaledVector(right, -0.5 * w * (1 - frac)).addScaledVector(toCam, 0.01)
      s.set(w * frac, BAR_H * 0.7, 1)
      f.setMatrixAt(n, m.compose(p, q, s))
      f.setColorAt(n, c.setHSL(0.33 * frac, 0.85, 0.5))
      n++
    }
    b.count = n
    f.count = n
    b.instanceMatrix.needsUpdate = true
    f.instanceMatrix.needsUpdate = true
    if (f.instanceColor) f.instanceColor.needsUpdate = true
  })

  return (
    <group>
      {TYPES.map((type, i) => (
        <instancedMesh
          key={type}
          ref={(mesh) => {
            meshes.current[i] = mesh
          }}
          args={[geos[PIECE_SYM[type]], undefined, MAX]}
          count={0}
          frustumCulled={false}
          castShadow
          dispose={null}
        >
          <meshPhysicalMaterial color="#ffffff" roughness={0.45} metalness={0.05} clearcoat={0.5} clearcoatRoughness={0.3} />
        </instancedMesh>
      ))}
      {bosses.map((b) => (
        <BossMesh key={b.id} sim={sim} snap={b} />
      ))}
      <instancedMesh ref={back} args={[undefined, undefined, MAX]} count={0} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#101014" transparent opacity={0.8} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={fill} args={[undefined, undefined, MAX]} count={0} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={1} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** A boss: a bigger black piece with a crown (decoys go bare) and a
 *  pulsing dark-red glow. Position / facing / tint follow its enemy
 *  record every frame; it hides once the record is gone. */
function BossMesh({ sim, snap }: { sim: Sim; snap: BossSnap }) {
  const { cols, rows } = sim.map
  const sym = symbolFor(snap.type)
  const geo = useMemo(() => pieceGeometries()[sym], [sym])
  const scale = ENEMY_SCALE * enemyScale(snap.type)
  const group = useRef<THREE.Group>(null)
  const mat = useRef<THREE.MeshPhysicalMaterial>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const st = sim.state
    const e = findEnemy(st, snap.id)
    g.visible = e !== null
    if (!e) return
    g.position.set(posX(e.pos.x, cols), 0, posZ(e.pos.y, rows))
    g.rotation.y = Math.atan2(e.dir.x, e.dir.y)
    if (mat.current) {
      mat.current.color.copy(tintFor(e, st.time))
      mat.current.emissiveIntensity = 0.3 + 0.2 * Math.sin(clock.elapsedTime * 4)
    }
  })
  return (
    <group ref={group} visible={false}>
      <mesh geometry={geo} scale={scale} castShadow dispose={null}>
        <meshPhysicalMaterial
          ref={mat}
          color={EBONY}
          emissive="#8a1a3a"
          emissiveIntensity={0.3}
          roughness={0.4}
          metalness={0.1}
          clearcoat={0.5}
          clearcoatRoughness={0.3}
        />
      </mesh>
      {!snap.decoy && (
        <group position={[0, PIECE_TOP[sym] * scale + 0.05, 0]}>
          <mesh>
            <cylinderGeometry args={[0.15, 0.11, 0.1, 8]} />
            <meshStandardMaterial color="#f1c34c" emissive="#f1c34c" emissiveIntensity={0.35} metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.09, 0]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshStandardMaterial color="#ff4d6d" emissive="#ff4d6d" emissiveIntensity={0.5} />
          </mesh>
        </group>
      )}
    </group>
  )
}
