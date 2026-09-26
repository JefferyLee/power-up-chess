// fx — the small self-contained effects Board3D and the Siege view
// share: corner torches, a spark burst, and the landing-ring pulse.
// Moved verbatim out of Board3D.tsx so the tower-defence scene can
// reuse them; behaviour is unchanged.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export const RING_DUR = 0.5
export const TORCH_INTENSITY = 9
export const SPARK_COUNT = 26
export const SPARK_LIFE = 0.55

/** A corner brazier — the castle's own light. Flame and point light
 *  flicker on two summed sines. */
export function Torch({ x, z, phase }: { x: number; z: number; phase: number }) {
  const light = useRef<THREE.PointLight>(null)
  const flame = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = 0.85 + Math.sin(9 * t + phase) * 0.1 + Math.sin(23 * t + phase) * 0.05
    if (light.current) light.current.intensity = TORCH_INTENSITY * s
    if (flame.current) flame.current.scale.set(s, s * 1.15 + 0.1 * Math.sin(13 * t + phase), s)
  })
  return (
    <group position={[x, -0.22, z]}>
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 1.3, 10]} />
        <meshStandardMaterial color="#2b2622" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.38, 0]}>
        <cylinderGeometry args={[0.2, 0.12, 0.22, 12]} />
        <meshStandardMaterial color="#2b2622" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 1.85, 0]}
        color="#ff9a4a"
        intensity={TORCH_INTENSITY}
        distance={12}
        decay={2}
      />
    </group>
  )
}
/** A puff of sparks where blades meet: points under gravity, additive,
 *  gone after SPARK_LIFE. Velocities are rolled by the parent's clash
 *  handler (an event, not render) and simulated in a ref here. */
export function SparkBurst({
  id,
  x,
  y,
  z,
  vel,
  onDone,
}: {
  id: number
  x: number
  y: number
  z: number
  vel: Float32Array
  onDone: (id: number) => void
}) {
  const geometry = useMemo(() => {
    const pos = new Float32Array(SPARK_COUNT * 3)
    for (let i = 0; i < SPARK_COUNT; i++) {
      pos[i * 3] = x
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = z
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [x, y, z])
  useEffect(() => () => geometry.dispose(), [geometry])
  const velRef = useRef(vel)
  const mat = useRef<THREE.PointsMaterial>(null)
  const life = useRef(0)
  const done = useRef(false)
  useFrame((_, dt) => {
    life.current += dt
    const v = velRef.current
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute
    const arr = attr.array as Float32Array
    for (let i = 0; i < SPARK_COUNT; i++) {
      const k = i * 3
      let vy = (v[k + 1] ?? 0) - 7 * dt
      let py = (arr[k + 1] ?? 0) + vy * dt
      if (py < 0.02) {
        py = 0.02
        vy *= -0.3
      }
      v[k + 1] = vy
      arr[k] = (arr[k] ?? 0) + (v[k] ?? 0) * dt
      arr[k + 1] = py
      arr[k + 2] = (arr[k + 2] ?? 0) + (v[k + 2] ?? 0) * dt
    }
    attr.needsUpdate = true
    if (mat.current) mat.current.opacity = Math.max(0, 1 - life.current / SPARK_LIFE)
    if (life.current >= SPARK_LIFE && !done.current) {
      done.current = true
      onDone(id)
    }
  })
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={mat}
        color="#ffd27a"
        size={0.07}
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}
/** Random outward-and-up spark velocities for one clash. */
// eslint-disable-next-line react-refresh/only-export-components -- helper that belongs beside SparkBurst
export function rollSparks(): Float32Array {
  const vel = new Float32Array(SPARK_COUNT * 3)
  for (let i = 0; i < SPARK_COUNT; i++) {
    const a = Math.random() * Math.PI * 2
    const h = 0.6 + Math.random() * 1.8
    vel[i * 3] = Math.cos(a) * h
    vel[i * 3 + 1] = 1.5 + Math.random() * 2.2
    vel[i * 3 + 2] = Math.sin(a) * h
  }
  return vel
}
/** Expanding golden ring on the square a piece just landed on. */
export function RingPulse({
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
