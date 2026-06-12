// GLTF chess piece assets — the Glowbox "Chess Set" (Sketchfab,
// CC-BY-4.0, see public/models3d/CREDITS.md). One scene holds every
// piece as a named node ("Pawn_3_Dark_3", "Tower_Dark_10", …) with
// two PBR materials (Chess_Pieces_Light / _Dark). We extract one
// geometry per piece type PER COLOUR (the two colours are authored
// facing each other, so no render-time flip is needed) and keep the
// baseColor textures for the painted-wood look. The board node was
// pruned from the shipped file — we render our own board.

import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { Color, PieceSymbol } from '../chess/types'

const MODEL_URL = '/models3d/glowbox/scene.gltf'

/** Target heights in board-square units (square = 1×1). */
const TARGET_HEIGHT: Record<PieceSymbol, number> = {
  p: 0.62,
  r: 0.72,
  n: 0.78,
  b: 0.88,
  q: 1.0,
  k: 1.1,
}

/** Node-name → piece type. The set calls rooks "Tower". */
const TYPE_PATTERNS: Array<[PieceSymbol, RegExp]> = [
  ['p', /^Pawn/i],
  ['r', /^Tower/i],
  ['n', /^Knight/i],
  ['b', /^Bishop/i],
  ['q', /^Queen/i],
  ['k', /^King/i],
]

export interface GltfPieceAssets {
  geos: Record<Color, Record<PieceSymbol, THREE.BufferGeometry>>
  maps: Record<Color, THREE.Texture | null>
}

/** Centre on x/z, base at y=0, uniform-scale to the target height.
 *  UVs ride along untouched (clone keeps all attributes). */
function normalize(g: THREE.BufferGeometry, targetHeight: number): void {
  g.computeBoundingBox()
  const bb = g.boundingBox!
  const height = bb.max.y - bb.min.y || 1
  const scale = targetHeight / height
  const cx = (bb.min.x + bb.max.x) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  g.translate(-cx, -bb.min.y, -cz)
  g.scale(scale, scale, scale)
}

/** Suspends until the set is fetched (drei useGLTF). */
export function useGltfPieceAssets(): GltfPieceAssets {
  const gltf = useGLTF(MODEL_URL)
  return useMemo(() => {
    const scene = gltf.scene
    scene.updateWorldMatrix(true, true)
    const geos = { w: {}, b: {} } as GltfPieceAssets['geos']
    const maps: GltfPieceAssets['maps'] = { w: null, b: null }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      // Meshes are anonymous Object_N children — the piece name lives
      // on an ancestor node.
      let name = ''
      for (let p: THREE.Object3D | null = mesh; p; p = p.parent) {
        if (/dark|light/i.test(p.name)) {
          name = p.name
          break
        }
      }
      if (!name) return
      const color: Color = /dark/i.test(name) ? 'b' : 'w'
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (!maps[color] && mat?.map) maps[color] = mat.map
      const entry = TYPE_PATTERNS.find(([, re]) => re.test(name))
      if (!entry) return
      const type = entry[0]
      if (geos[color][type]) return
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      // Knights are authored facing sideways — turn 90° clockwise
      // (viewed from above). Same world rotation for both colours
      // keeps them facing each other.
      if (type === 'n') g.rotateY(-Math.PI / 2)
      normalize(g, TARGET_HEIGHT[type])
      geos[color][type] = g
    })
    return { geos, maps }
  }, [gltf])
}
