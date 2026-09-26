// Towers — one persistent mesh per white piece. The list re-renders
// only when a tower is built / sold / upgraded / promoted / swapped (a
// per-frame snapshot compare, so it needs no events); everything that
// moves each tick — recoil, stun, king aura — is written straight to
// the meshes from the frame loop.
import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pieceGeometries } from '../../../board3d/pieceGeometry'
import type { Sim, TowerLevel, TowerState, TowerType } from '../sim/types'
import { cellX, cellZ, findTower, IVORY, PIECE_SYM, PIECE_TOP, TOWER_SCALE } from './world'

interface TowerSnap {
  id: number
  type: TowerType
  level: TowerLevel
  branch: string | null
  c: number
  r: number
}

const RECOIL_DUR = 0.18
const IVORY_C = new THREE.Color(IVORY)
const STUN_C = new THREE.Color('#7d8fb0')
const BRONZE = '#b08d57'
const GOLD = '#f1c34c'
/** Level-3 branch → emissive tint (ids as named in docs/SIEGE_DESIGN.md
 *  §2, lower-cased; anything unlisted glows a soft gold). */
const BRANCH_TINT: Record<string, string> = {
  spear: '#d8c07a',
  storm: '#7ec8ff',
  charger: '#ffb070',
  frost: '#9fd8ff',
  sun: '#ffa53a',
  cannon: '#ff8a5a',
  siege: '#c8c8d0',
  fury: '#ff6a6a',
  empress: '#ffd25e',
  rally: '#f1c34c',
  treasury: '#ffe08a',
}

function same(snaps: TowerSnap[], list: TowerState[]): boolean {
  if (snaps.length !== list.length) return false
  for (let i = 0; i < list.length; i++) {
    const s = snaps[i]
    const t = list[i]
    if (!s || !t) return false
    if (s.id !== t.id || s.type !== t.type || s.level !== t.level || s.branch !== t.branch || s.c !== t.cell.c || s.r !== t.cell.r) return false
  }
  return true
}

export function Towers({ sim }: { sim: Sim }) {
  const [snaps, setSnaps] = useState<TowerSnap[]>([])
  const current = useRef(snaps)
  useFrame(() => {
    const list = sim.state.towers
    if (same(current.current, list)) return
    current.current = list.map((t) => ({ id: t.id, type: t.type, level: t.level, branch: t.branch, c: t.cell.c, r: t.cell.r }))
    setSnaps(current.current)
  })
  return (
    <group>
      {snaps.map((s) => (
        <TowerMesh key={s.id} sim={sim} snap={s} />
      ))}
    </group>
  )
}

function TowerMesh({ sim, snap }: { sim: Sim; snap: TowerSnap }) {
  const { cols, rows } = sim.map
  const sym = PIECE_SYM[snap.type]
  const geo = useMemo(() => pieceGeometries()[sym], [sym])
  const piece = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshPhysicalMaterial>(null)
  const halo = useRef<THREE.Mesh>(null)
  const haloMat = useRef<THREE.MeshBasicMaterial>(null)
  const stunRing = useRef<THREE.Group>(null)
  const prevCd = useRef(0)
  const recoil = useRef(RECOIL_DUR)
  useFrame(({ clock }, dt) => {
    const st = sim.state
    const t = findTower(st, snap.id)
    if (!t) return
    // Cooldown snapping back toward 0 means it just fired.
    if (t.cooldown < prevCd.current - 0.4) recoil.current = 0
    prevCd.current = t.cooldown
    let k = 1
    if (recoil.current < RECOIL_DUR) {
      recoil.current += dt
      k = 1 + 0.14 * Math.sin(Math.PI * Math.min(1, recoil.current / RECOIL_DUR))
    }
    const stunned = t.stunnedUntil > st.time
    if (piece.current) piece.current.scale.set(TOWER_SCALE * k, TOWER_SCALE * (2 - k), TOWER_SCALE * k)
    if (mat.current) mat.current.color.copy(stunned ? STUN_C : IVORY_C)
    if (stunRing.current) {
      stunRing.current.visible = stunned
      stunRing.current.rotation.y = clock.elapsedTime * 4
    }
    if (halo.current) halo.current.visible = t.buffed
    if (haloMat.current) haloMat.current.opacity = 0.26 + 0.1 * Math.sin(clock.elapsedTime * 3)
  })
  const tint = snap.branch ? (BRANCH_TINT[snap.branch.toLowerCase()] ?? GOLD) : null
  return (
    <group position={[cellX(snap.c, cols), 0, cellZ(snap.r, rows)]}>
      <mesh ref={piece} geometry={geo} scale={TOWER_SCALE} castShadow dispose={null}>
        <meshPhysicalMaterial
          ref={mat}
          color={IVORY}
          emissive={tint ?? '#000000'}
          emissiveIntensity={tint ? 0.35 : 0}
          roughness={0.45}
          metalness={0.05}
          clearcoat={0.7}
          clearcoatRoughness={0.25}
        />
      </mesh>
      {snap.level >= 2 && (
        <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.4, 32]} />
          <meshStandardMaterial color={snap.level === 3 ? GOLD : BRONZE} metalness={0.6} roughness={0.35} />
        </mesh>
      )}
      <mesh ref={halo} visible={false} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.56, 32]} />
        <meshBasicMaterial ref={haloMat} color={GOLD} transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <group ref={stunRing} visible={false} position={[0, PIECE_TOP[sym] * TOWER_SCALE + 0.14, 0]}>
        <mesh rotation={[1.2, 0, 0]}>
          <torusGeometry args={[0.22, 0.03, 6, 20]} />
          <meshBasicMaterial color="#8fb8ff" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}
