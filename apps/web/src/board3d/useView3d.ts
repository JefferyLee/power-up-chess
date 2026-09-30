// useView3d — the "🎲 3D / 🎲 2D" toggle, remembered across screens
// and sessions in localStorage so a kid who likes 3D isn't flipped
// back to 2D every time they open a board. Imports only from 'react'
// and storage/: the screens lazy-load the three.js chunk, and this
// hook must not drag it into the main bundle.

import type { Dispatch, SetStateAction } from 'react'
import { KEYS } from '../storage/keys'
import { flagCodec, usePersistedState } from '../storage/usePersistedState'

export function useView3d(): [boolean, Dispatch<SetStateAction<boolean>>] {
  return usePersistedState(KEYS.board3dView, false, flagCodec)
}
