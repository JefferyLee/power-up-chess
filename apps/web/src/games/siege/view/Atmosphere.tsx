// Atmosphere — Board3D's dark hall around the Siege table: backdrop +
// matching fog, a warm key with 2048 shadows, a cool rim, a side fill,
// the table disc, a slab under the cells and four corner torches.
import { Torch } from '../../../board3d/fx'
import type { ThemePalette } from './themes'

export function Atmosphere({ palette, cols, rows }: { palette: ThemePalette; cols: number; rows: number }) {
  const span = Math.max(cols, rows)
  const half = span / 2 + 2
  const tx = cols / 2 + 1.1
  const tz = rows / 2 + 1.1
  const torches: Array<[number, number]> = [[-tx, -tz], [tx, -tz], [-tx, tz], [tx, tz]]
  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.bg, span * 1.3, span * 2.8]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={1}
        shadow-camera-far={40}
      />
      <directionalLight position={[-7, 6, -8]} intensity={0.9} color="#6f9be0" />
      <pointLight position={[-tx - 1, 3, tz + 1]} intensity={palette.fillIntensity} color={palette.fill} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
        <circleGeometry args={[span * 1.6, 48]} />
        <meshStandardMaterial color={palette.ground} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[cols + 0.8, 0.12, rows + 0.8]} />
        <meshStandardMaterial color={palette.frame} roughness={0.85} />
      </mesh>
      {torches.map(([x, z], i) => (
        <Torch key={i} x={x} z={z} phase={i * 1.7} />
      ))}
    </>
  )
}
