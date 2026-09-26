// SiegeScene — the R3F view of the Siege sim. Owns the frame loop (one
// sim.tick per frame; events → effects → onEvents), the camera and the
// hall around the table. Everything reads sim.state from its own
// useFrame; React state changes only on discrete moments (the tower
// list changing, an effect spawning, the boss banner).
import { useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { Sim, SimEvent } from '../sim/types'
import { Atmosphere } from './Atmosphere'
import { CameraRig } from './CameraRig'
import { Effects, type FxHandle } from './Effects'
import { Enemies } from './Enemies'
import { Gates } from './Gates'
import { Grid } from './Grid'
import { Shots } from './Shots'
import { THEMES } from './themes'
import { Towers } from './Towers'
import { fitCamera } from './world'
import type { SiegeSceneProps } from './types'

const MAX_DT = 0.1

/** The one place the sim advances. Priority -1 runs it before every
 *  other useFrame, so the readers see this frame's state. */
function FrameLoop({ sim, onEvents, fx }: { sim: Sim; onEvents: (events: SimEvent[]) => void; fx: RefObject<FxHandle | null> }) {
  useFrame((_, delta) => {
    const events = sim.tick(Math.min(MAX_DT, delta))
    if (events.length > 0) fx.current?.consume(events)
    onEvents(events)
  }, -1)
  return null
}

export function SiegeScene({ sim, onEvents, onCellTap, onCellHover, highlightCells, selectedCell, ghost, theme }: SiegeSceneProps) {
  const fx = useRef<FxHandle | null>(null)
  const palette = THEMES[theme]
  const { cols, rows } = sim.map
  const camera = useMemo(() => ({ position: fitCamera(cols, rows), fov: 40 }), [cols, rows])
  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onPointerDownCapture={() => {
        if (sim.state.bossIntro < 1) sim.skipIntro()
      }}
    >
      <Canvas shadows="soft" dpr={[1, 1.5]} camera={camera} style={{ touchAction: 'none' }}>
        <FrameLoop sim={sim} onEvents={onEvents} fx={fx} />
        <Atmosphere palette={palette} cols={cols} rows={rows} />
        <Grid
          sim={sim}
          palette={palette}
          highlightCells={highlightCells}
          selectedCell={selectedCell}
          ghost={ghost}
          onCellTap={onCellTap}
          onCellHover={onCellHover}
        />
        <Gates map={sim.map} />
        <Towers sim={sim} />
        <Enemies sim={sim} />
        <Shots sim={sim} />
        <Effects sim={sim} handle={fx} />
        <CameraRig sim={sim} />
      </Canvas>
    </div>
  )
}
