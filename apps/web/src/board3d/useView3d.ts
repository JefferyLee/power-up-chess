// useView3d — the "🎲 3D / 🎲 2D" toggle, remembered across screens
// and sessions in localStorage so a kid who likes 3D isn't flipped
// back to 2D every time they open a board. Imports only from 'react':
// the screens lazy-load the three.js chunk, and this hook must not
// drag it into the main bundle.

import { useEffect, useState } from 'react'

const KEY = 'puc.board3d.view'

export function useView3d(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [view3d, setView3d] = useState(() => {
    try { return localStorage.getItem(KEY) === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem(KEY, view3d ? '1' : '0') } catch { /* private mode */ }
  }, [view3d])
  return [view3d, setView3d]
}
