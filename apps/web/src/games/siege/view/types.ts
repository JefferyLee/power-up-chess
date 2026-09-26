// Props contract for the R3F scene (view/) — owned by the screen (ui/).
import type { Cell, Sim, SimEvent, Theme, TowerType } from '../sim/types'

export interface SiegeSceneProps {
  sim: Sim
  /** The scene owns the frame loop: it calls sim.tick(dt) once per frame
   *  and hands the returned events here (for sounds + HUD) after it has
   *  used them for effects. Called every frame, possibly with []. */
  onEvents: (events: SimEvent[]) => void
  onCellTap: (cell: Cell) => void
  onCellHover?: (cell: Cell | null) => void
  /** Cells painted with the legal-move green (attack preview). */
  highlightCells: Cell[]
  /** The selected tower's cell (gold ring), or null. */
  selectedCell: Cell | null
  /** Placement ghost: a translucent piece on the hovered cell. */
  ghost: { type: TowerType; cell: Cell; ok: boolean } | null
  theme: Theme
}
