// SiegeSceneDemo — SiegeScene on the mock sim, full-viewport, with a
// theme switcher. Not wired into the app's routes: import it from a
// scratch route or a Vite html entry to eyeball the view.
import { useCallback, useState } from 'react'
import type { Cell, Theme, TowerType } from '../sim/types'
import { createMockSim } from './mockSim'
import { SiegeScene } from './SiegeScene'

const THEME_LIST: Theme[] = ['courtyard', 'forest', 'frost', 'lava', 'throne']
const noEvents = () => {}

export function SiegeSceneDemo() {
  const [sim] = useState(createMockSim)
  const [theme, setTheme] = useState<Theme>('courtyard')
  const [ghost, setGhost] = useState<{ type: TowerType; cell: Cell; ok: boolean } | null>(null)
  const [selected, setSelected] = useState<Cell | null>(null)

  const onHover = useCallback(
    (cell: Cell | null) => {
      if (!cell || sim.cellKind(cell) !== 'plot' || sim.towerAt(cell)) {
        setGhost(null)
        return
      }
      setGhost({ type: 'pawn', cell, ok: sim.canBuild(cell, 'pawn').ok })
    },
    [sim],
  )
  const onTap = useCallback(
    (cell: Cell) => {
      const t = sim.towerAt(cell)
      if (t) {
        const prev = selected ? sim.towerAt(selected) : null
        if (prev && prev.id !== t.id) {
          sim.castSpell('castling', { kind: 'towers', a: prev.id, b: t.id })
          setSelected(null)
        } else {
          setSelected(cell)
        }
        return
      }
      setSelected(null)
      const kind = sim.cellKind(cell)
      if (kind === 'plot') {
        sim.build(cell, 'pawn')
        setGhost(null)
      } else if (kind === 'road') {
        sim.castSpell('fork', { kind: 'cell', cell })
      }
    },
    [sim, selected],
  )

  const selectedTower = selected ? sim.towerAt(selected) : null
  const highlight =
    selected && selectedTower
      ? sim.attackCells(selectedTower.type, selected, selectedTower.level, selectedTower.branch)
      : ghost
        ? sim.attackCells('pawn', ghost.cell, 1, null)
        : []

  const chip = (active: boolean) => ({
    padding: '6px 10px',
    borderRadius: 999,
    border: 'none',
    background: active ? '#f1c34c' : 'rgba(40, 40, 48, 0.85)',
    color: active ? '#222' : '#fff',
    font: '600 13px system-ui, sans-serif',
    cursor: 'pointer',
  })
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <SiegeScene
        sim={sim}
        theme={theme}
        onEvents={noEvents}
        onCellTap={onTap}
        onCellHover={onHover}
        highlightCells={highlight}
        selectedCell={selected}
        ghost={ghost}
      />
      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
        {THEME_LIST.map((t) => (
          <button key={t} type="button" onClick={() => setTheme(t)} style={chip(t === theme)}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ position: 'absolute', bottom: 10, left: 10, color: '#cfc4ad', font: '13px system-ui, sans-serif' }}>
        tap a plot: build a pawn · tap a road: Fork · tap two towers: Castling · tap during the boss intro: skip
      </div>
    </div>
  )
}
