// useBoardView — the "🎲 3D / 🎲 2D" toggle plus fullscreen-3D state,
// shared by every board screen. view3d is remembered across screens
// (board3d/useView3d); fullscreen is per visit. While fullscreen the
// page can't scroll and Escape leaves.

import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react'
import { useView3d } from '../board3d/useView3d'

export interface BoardView {
  view3d: boolean
  /** Flip the renderer. Also leaves fullscreen — the overlay is 3D-only. */
  setView3d: (next: SetStateAction<boolean>) => void
  fs3d: boolean
  enterFs: () => void
  exitFs: () => void
}

export function useBoardView(): BoardView {
  const [view3d, setView3dRaw] = useView3d()
  const [fs3d, setFs3d] = useState(false)

  useEffect(() => {
    if (!fs3d) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFs3d(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [fs3d])

  const setView3d = useCallback((next: SetStateAction<boolean>) => {
    setView3dRaw(next)
    setFs3d(false)
  }, [setView3dRaw])
  const enterFs = useCallback(() => setFs3d(true), [])
  const exitFs = useCallback(() => setFs3d(false), [])

  return useMemo(
    () => ({ view3d, setView3d, fs3d, enterFs, exitFs }),
    [view3d, setView3d, fs3d, enterFs, exitFs],
  )
}
