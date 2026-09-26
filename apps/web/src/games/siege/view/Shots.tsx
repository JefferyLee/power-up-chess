// Shots — everything the sim fires, read from state every frame:
// projectiles (arrow sphere + trail, knight jump on a parabola, bolt),
// beams (one additive instanced strip per straight beam, a small pool
// of jittered fat lines for chain lightning) and boss / spell
// telegraphs (red tiles, strips and expanding rings). All fade by
// ttl / life. Additive blending means colour × fade IS the fade, so
// one instanced mesh carries every straight beam.
import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { BeamState, Sim } from '../sim/types'
import { cellX, cellZ, IVORY, posX, posZ } from './world'

const MAX_PROJ = 128
const MAX_BEAMS = 64
const MAX_CHAINS = 6
const CHAIN_PTS = 8
const MAX_TILES = 256
const MAX_STRIPS = 16
const MAX_RINGS = 8
const BEAM_Y = 0.45
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const BEAM_COLOR: Record<BeamState['kind'], THREE.Color> = {
  rook: new THREE.Color('#ffb347'),
  bishop: new THREE.Color('#b57bff'),
  queen: new THREE.Color('#ffe9a8'),
  chain: new THREE.Color('#5ec8ff'),
  skewer: new THREE.Color('#ff3b3b'),
}
const RED = new THREE.Color('#ff2a2a')
const CHAIN_INIT: Array<[number, number, number]> = Array.from({ length: CHAIN_PTS }, () => [0, 0, 0])
/** Jittered chain-lightning points for the beam in progress (scratch). */
const pts = new Float32Array(CHAIN_PTS * 3)

interface Tmp {
  m: THREE.Matrix4
  p: THREE.Vector3
  q: THREE.Quaternion
  s: THREE.Vector3
  c: THREE.Color
}

function place(t: Tmp, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  t.p.set(x, y, z)
  t.q.setFromAxisAngle(Y_AXIS, ry)
  t.s.set(sx, sy, sz)
  return t.m.compose(t.p, t.q, t.s)
}

function setCount(mesh: THREE.InstancedMesh | null, n: number): void {
  if (!mesh) return
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function fadeOf(ttl: number, life: number): number {
  return life > 0 ? Math.max(0, Math.min(1, ttl / life)) : 0
}

export function Shots({ sim }: { sim: Sim }) {
  const { cols, rows } = sim.map
  const arrows = useRef<THREE.InstancedMesh>(null)
  const trails = useRef<THREE.InstancedMesh>(null)
  const jumps = useRef<THREE.InstancedMesh>(null)
  const bolts = useRef<THREE.InstancedMesh>(null)
  const beams = useRef<THREE.InstancedMesh>(null)
  const chains = useRef<Array<ComponentRef<typeof Line> | null>>([])
  const tiles = useRef<THREE.InstancedMesh>(null)
  const strips = useRef<THREE.InstancedMesh>(null)
  const rings = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo<Tmp>(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      c: new THREE.Color(),
    }),
    [],
  )
  const tile = useMemo(() => new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2), [])
  const ring = useMemo(() => new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), [])
  useEffect(() => () => {
    tile.dispose()
    ring.dispose()
  }, [tile, ring])

  useFrame(() => {
    const st = sim.state
    const { c } = tmp

    // ── projectiles ──
    const A = arrows.current
    const T = trails.current
    const J = jumps.current
    const B = bolts.current
    let na = 0
    let nj = 0
    let nb = 0
    for (const pr of st.projectiles) {
      const x = posX(pr.from.x + (pr.to.x - pr.from.x) * pr.t, cols)
      const z = posZ(pr.from.y + (pr.to.y - pr.from.y) * pr.t, rows)
      if (pr.kind === 'arrow') {
        if (!A || !T || na >= MAX_PROJ) continue
        A.setMatrixAt(na, place(tmp, x, BEAM_Y, z, 0, 1, 1, 1))
        const dx = pr.to.x - pr.from.x
        const dz = pr.to.y - pr.from.y
        const len = Math.hypot(dx, dz) || 1
        T.setMatrixAt(na++, place(tmp, x - (dx / len) * 0.2, BEAM_Y, z - (dz / len) * 0.2, Math.atan2(dx, dz), 0.035, 0.035, 0.36))
      } else if (pr.kind === 'jump') {
        if (!J || nj >= MAX_PROJ) continue
        J.setMatrixAt(nj++, place(tmp, x, 0.35 + 0.8 * 4 * pr.t * (1 - pr.t), z, 0, 1, 1, 1))
      } else {
        if (!B || nb >= MAX_PROJ) continue
        B.setMatrixAt(nb++, place(tmp, x, 0.5, z, 0, 1, 1, 1))
      }
    }
    setCount(A, na)
    setCount(T, na)
    setCount(J, nj)
    setCount(B, nb)

    // ── beams ──
    const BM = beams.current
    let nbm = 0
    let nch = 0
    for (const b of st.beams) {
      const fade = fadeOf(b.ttl, b.life)
      const x1 = posX(b.from.x, cols)
      const z1 = posZ(b.from.y, rows)
      const x2 = posX(b.to.x, cols)
      const z2 = posZ(b.to.y, rows)
      if (b.kind === 'chain') {
        const line = chains.current[nch]
        if (!line || nch >= MAX_CHAINS) continue
        nch++
        const dx = x2 - x1
        const dz = z2 - z1
        const len = Math.hypot(dx, dz) || 1
        const nx = -dz / len
        const nz = dx / len
        for (let i = 0; i < CHAIN_PTS; i++) {
          const u = i / (CHAIN_PTS - 1)
          const end = i === 0 || i === CHAIN_PTS - 1
          const j = end ? 0 : (Math.random() - 0.5) * 0.36 * fade
          pts[i * 3] = x1 + dx * u + nx * j
          pts[i * 3 + 1] = BEAM_Y + 0.05 + (end ? 0 : (Math.random() - 0.5) * 0.12 * fade)
          pts[i * 3 + 2] = z1 + dz * u + nz * j
        }
        line.geometry.setPositions(pts)
        line.material.opacity = fade
        line.visible = true
        continue
      }
      if (!BM || nbm >= MAX_BEAMS) continue
      const w = 0.04 + 0.07 * fade
      BM.setMatrixAt(nbm, place(tmp, (x1 + x2) / 2, BEAM_Y, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1), w, w, Math.hypot(x2 - x1, z2 - z1)))
      BM.setColorAt(nbm++, c.copy(BEAM_COLOR[b.kind]).multiplyScalar(fade))
    }
    setCount(BM, nbm)
    for (let i = nch; i < MAX_CHAINS; i++) {
      const line = chains.current[i]
      if (line) line.visible = false
    }

    // ── telegraphs ──
    const TI = tiles.current
    const ST = strips.current
    const RI = rings.current
    let nt = 0
    let ns = 0
    let nr = 0
    for (const tg of st.telegraphs) {
      const fade = fadeOf(tg.ttl, tg.life)
      const pulse = fade * (0.55 + 0.45 * Math.sin(st.time * 14))
      if (tg.kind === 'cells') {
        if (!TI) continue
        for (const cell of tg.cells) {
          if (nt >= MAX_TILES) break
          TI.setMatrixAt(nt, place(tmp, cellX(cell.c, cols), 0.014, cellZ(cell.r, rows), 0, 1, 1, 1))
          TI.setColorAt(nt++, c.copy(RED).multiplyScalar(pulse))
        }
      } else if (tg.kind === 'line') {
        const a = tg.cells[0]
        const b = tg.cells[tg.cells.length - 1]
        if (!ST || !a || !b || ns >= MAX_STRIPS) continue
        const x1 = cellX(a.c, cols)
        const z1 = cellZ(a.r, rows)
        const x2 = cellX(b.c, cols)
        const z2 = cellZ(b.r, rows)
        ST.setMatrixAt(ns, place(tmp, (x1 + x2) / 2, 0.02, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1), 0.6, 0.02, Math.hypot(x2 - x1, z2 - z1) + 1))
        ST.setColorAt(ns++, c.copy(RED).multiplyScalar(pulse))
      } else {
        if (!RI || nr >= MAX_RINGS) continue
        // Centre on the cells' centroid; reach the furthest one; expand
        // over the warning's life.
        let cx = 0
        let cz = 0
        for (const cell of tg.cells) {
          cx += cellX(cell.c, cols)
          cz += cellZ(cell.r, rows)
        }
        const n = tg.cells.length || 1
        cx /= n
        cz /= n
        let rad = 0.6
        for (const cell of tg.cells) rad = Math.max(rad, Math.hypot(cellX(cell.c, cols) - cx, cellZ(cell.r, rows) - cz) + 0.5)
        const grow = rad * (0.3 + 0.7 * (1 - fade))
        RI.setMatrixAt(nr, place(tmp, cx, 0.02, cz, 0, grow, 1, grow))
        RI.setColorAt(nr++, c.copy(RED).multiplyScalar(fade))
      }
    }
    setCount(TI, nt)
    setCount(ST, ns)
    setCount(RI, nr)
  })

  return (
    <group>
      <instancedMesh ref={arrows} args={[undefined, undefined, MAX_PROJ]} count={0} frustumCulled={false}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color={IVORY} emissive={IVORY} emissiveIntensity={0.5} />
      </instancedMesh>
      <instancedMesh ref={trails} args={[undefined, undefined, MAX_PROJ]} count={0} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={IVORY} transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={jumps} args={[undefined, undefined, MAX_PROJ]} count={0} frustumCulled={false} castShadow>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#e8e0d0" roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={bolts} args={[undefined, undefined, MAX_PROJ]} count={0} frustumCulled={false}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshBasicMaterial color="#cfeaff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={beams} args={[undefined, undefined, MAX_BEAMS]} count={0} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {CHAIN_INIT.map((_, i) => (
        <Line
          key={i}
          ref={(l) => {
            chains.current[i] = l
          }}
          points={CHAIN_INIT}
          color="#5ec8ff"
          lineWidth={2.5}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      ))}
      <instancedMesh ref={tiles} args={[tile, undefined, MAX_TILES]} count={0} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={strips} args={[undefined, undefined, MAX_STRIPS]} count={0} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[ring, undefined, MAX_RINGS]} count={0} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
}
