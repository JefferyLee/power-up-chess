// Grid — the map as one InstancedMesh of cell boxes (chessboard-tinted
// plots, cobble roads, low wall blocks) plus the overlays: legal-move
// green tiles, the gold selection ring, a faint hover tint, the
// placement ghost and faded path chevrons. It is also the only thing
// the pointer raycasts: instanceId → cell, for tap (down and up within
// 6 px) and hover.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { pieceGeometries } from '../../../board3d/pieceGeometry'
import type { Cell, Sim, TowerType } from '../sim/types'
import type { ThemePalette } from './themes'
import { cellX, cellZ, PIECE_SYM, TINT_LEGAL, TINT_SELECTED, TOWER_SCALE } from './world'

const TAP_PX = 6
const MAX_CHEVRONS = 512
const Y_AXIS = new THREE.Vector3(0, 1, 0)

interface GridProps {
  sim: Sim
  palette: ThemePalette
  highlightCells: Cell[]
  selectedCell: Cell | null
  ghost: { type: TowerType; cell: Cell; ok: boolean } | null
  onCellTap: (cell: Cell) => void
  onCellHover?: (cell: Cell | null) => void
}

export function Grid({ sim, palette, highlightCells, selectedCell, ghost, onCellTap, onCellHover }: GridProps) {
  const { map } = sim
  const { cols, rows } = map
  const cells = useRef<THREE.InstancedMesh>(null)
  const highlights = useRef<THREE.InstancedMesh>(null)
  const chevrons = useRef<THREE.InstancedMesh>(null)
  const hoverTile = useRef<THREE.Mesh>(null)
  const pathSig = useRef(-1)
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), c: new THREE.Color() }),
    [],
  )
  const geos = useMemo(() => pieceGeometries(), [])
  // Flat geometries for the instanced overlays (rotation baked in).
  const tile = useMemo(() => new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), [])
  const chevron = useMemo(() => {
    const sh = new THREE.Shape()
    sh.moveTo(0, -0.17)
    sh.lineTo(-0.14, 0.1)
    sh.lineTo(0, 0.03)
    sh.lineTo(0.14, 0.1)
    sh.closePath()
    return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2)
  }, [])
  useEffect(() => () => {
    tile.dispose()
    chevron.dispose()
  }, [tile, chevron])

  // Cell boxes: laid out once per map / theme.
  useLayoutEffect(() => {
    const mesh = cells.current
    if (!mesh) return
    const { m, p, q, s, c } = tmp
    q.identity()
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const ch = map.cells[r]?.[col] ?? '#'
        const wall = ch === '#'
        p.set(cellX(col, cols), wall ? 0.1 : -0.05, cellZ(r, rows))
        s.set(1, wall ? 3 : 1, 1)
        mesh.setMatrixAt(r * cols + col, m.compose(p, q, s))
        const tone = wall
          ? palette.wall
          : ch === '.' || ch === 'S' || ch === 'G'
            ? palette.road
            : (col + r) % 2 === 0
              ? palette.light
              : palette.dark
        mesh.setColorAt(r * cols + col, c.set(tone))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    // A new map (or a remount) needs its chevrons laid out again.
    pathSig.current = -1
  }, [map, cols, rows, palette, tmp])

  // Legal-move tiles follow the prop.
  useLayoutEffect(() => {
    const mesh = highlights.current
    if (!mesh) return
    const { m, p, q, s } = tmp
    q.identity()
    s.set(1, 1, 1)
    let n = 0
    for (const cell of highlightCells) {
      if (n >= cols * rows) break
      p.set(cellX(cell.c, cols), 0.012, cellZ(cell.r, rows))
      mesh.setMatrixAt(n++, m.compose(p, q, s))
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  }, [highlightCells, cols, rows, tmp])

  // Path chevrons: rebuilt only when the flow field changes (cheap hash).
  useFrame(() => {
    const paths = sim.state.paths
    let sig = paths.length
    for (const path of paths) {
      sig = (sig * 31 + path.length) | 0
      for (const cell of path) sig = (sig * 31 + cell.c * 131 + cell.r) | 0
    }
    if (sig === pathSig.current) return
    pathSig.current = sig
    const mesh = chevrons.current
    if (!mesh) return
    const { m, p, q, s } = tmp
    s.set(1, 1, 1)
    let n = 0
    for (const path of paths) {
      for (let i = 0; i + 1 < path.length && n < MAX_CHEVRONS; i++) {
        const a = path[i]
        const b = path[i + 1]
        if (!a || !b) continue
        p.set((cellX(a.c, cols) + cellX(b.c, cols)) / 2, 0.016, (cellZ(a.r, rows) + cellZ(b.r, rows)) / 2)
        q.setFromAxisAngle(Y_AXIS, Math.atan2(b.c - a.c, b.r - a.r))
        mesh.setMatrixAt(n++, m.compose(p, q, s))
      }
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
  })

  // Pointer: a tap is down + up on the same spot; hover is reported on change.
  const down = useRef<{ x: number; y: number } | null>(null)
  const hover = useRef<Cell | null>(null)
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = down.current
    down.current = null
    if (!d || e.instanceId === undefined) return
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_PX) {
      onCellTap({ c: e.instanceId % cols, r: Math.floor(e.instanceId / cols) })
    }
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return
    const c = e.instanceId % cols
    const r = Math.floor(e.instanceId / cols)
    const h = hover.current
    if (h && h.c === c && h.r === r) return
    hover.current = { c, r }
    onCellHover?.(hover.current)
  }
  const onOut = () => {
    if (!hover.current) return
    hover.current = null
    onCellHover?.(null)
  }
  useFrame(() => {
    const t = hoverTile.current
    if (!t) return
    const h = hover.current
    t.visible = h !== null
    if (h) t.position.set(cellX(h.c, cols), 0.02, cellZ(h.r, rows))
  })

  return (
    <group>
      <instancedMesh
        ref={cells}
        args={[undefined, undefined, cols * rows]}
        frustumCulled={false}
        castShadow
        receiveShadow
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerMove={onMove}
        onPointerOut={onOut}
      >
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={highlights} args={[tile, undefined, cols * rows]} count={0} frustumCulled={false}>
        <meshBasicMaterial color={TINT_LEGAL} transparent opacity={0.6} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={chevrons} args={[chevron, undefined, MAX_CHEVRONS]} count={0} frustumCulled={false}>
        <meshBasicMaterial color={palette.chevron} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <mesh ref={hoverTile} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      {selectedCell && (
        <mesh position={[cellX(selectedCell.c, cols), 0.02, cellZ(selectedCell.r, rows)]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.36, 0.46, 40]} />
          <meshBasicMaterial color={TINT_SELECTED} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {ghost && (
        <mesh
          geometry={geos[PIECE_SYM[ghost.type]]}
          position={[cellX(ghost.cell.c, cols), 0.02, cellZ(ghost.cell.r, rows)]}
          scale={TOWER_SCALE}
          dispose={null}
        >
          <meshStandardMaterial
            color={ghost.ok ? TINT_LEGAL : '#e05a4a'}
            emissive={ghost.ok ? TINT_LEGAL : '#e05a4a'}
            emissiveIntensity={0.35}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
