// Gates — the spawn arches (dark stone) and the goal: a small white
// castle gate, the thing being defended. Each faces the road cell next
// to it.
import { useMemo } from 'react'
import type { Cell, MapDef } from '../sim/types'
import { cellX, cellZ, findGates, IVORY } from './world'

const STONE = '#2a2530'
const WALKABLE = '.SGo'
const DIRS: Array<[number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]]

/** Rotation about y that points local +z at the first walkable neighbour. */
function facing(map: MapDef, cell: Cell): number {
  for (const [dc, dr] of DIRS) {
    const ch = map.cells[cell.r + dr]?.[cell.c + dc] ?? '#'
    if (WALKABLE.includes(ch)) return Math.atan2(dc, dr)
  }
  return 0
}

export function Gates({ map }: { map: MapDef }) {
  const { cols, rows } = map
  const gates = useMemo(() => findGates(map), [map])
  return (
    <group>
      {gates.spawns.map((g, i) => (
        <group key={i} position={[cellX(g.c, cols), 0, cellZ(g.r, rows)]} rotation={[0, facing(map, g), 0]}>
          {[-0.34, 0.34].map((x) => (
            <mesh key={x} position={[x, 0.45, 0]} castShadow>
              <boxGeometry args={[0.2, 0.9, 0.24]} />
              <meshStandardMaterial color={STONE} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.9, 0]}>
            <torusGeometry args={[0.34, 0.08, 8, 16, Math.PI]} />
            <meshStandardMaterial color={STONE} roughness={0.9} />
          </mesh>
        </group>
      ))}
      <group position={[cellX(gates.goal.c, cols), 0, cellZ(gates.goal.r, rows)]} rotation={[0, facing(map, gates.goal), 0]}>
        {[-0.36, 0.36].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.18, 1, 12]} />
              <meshStandardMaterial color={IVORY} roughness={0.7} />
            </mesh>
            <mesh position={[0, 1.13, 0]} castShadow>
              <coneGeometry args={[0.2, 0.28, 12]} />
              <meshStandardMaterial color="#a33a3a" roughness={0.7} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.88, 0]} castShadow>
          <boxGeometry args={[0.6, 0.22, 0.2]} />
          <meshStandardMaterial color={IVORY} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.56, 0]}>
          <torusGeometry args={[0.24, 0.05, 8, 16, Math.PI]} />
          <meshStandardMaterial color={IVORY} roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}
