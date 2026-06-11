// GLTF chess piece geometry — loads the six Sketchfab models (see
// public/models3d/CREDITS.md for attribution) and normalises each
// into a single merged BufferGeometry: centred on x/z, base at y=0,
// uniformly scaled to a per-piece target height in board units.
// Textures were stripped from the gltf files (we apply our own
// per-side materials), so the geometry is all we read.

import { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import type { PieceSymbol } from '../chess/types'
import { mergeGeometries } from './pieceGeometry'

/** Target heights in board-square units (square = 1×1). Slightly
 *  taller than the procedural set — the models carry finer detail
 *  and can afford the presence. */
const TARGET_HEIGHT: Record<PieceSymbol, number> = {
  p: 0.62,
  r: 0.72,
  n: 0.78,
  b: 0.88,
  q: 1.0,
  k: 1.1,
}

const MODEL_URL: Record<PieceSymbol, string> = {
  p: '/models3d/pawn/scene.gltf',
  r: '/models3d/rook/scene.gltf',
  n: '/models3d/knight/scene.gltf',
  b: '/models3d/bishop/scene.gltf',
  q: '/models3d/queen/scene.gltf',
  k: '/models3d/king/scene.gltf',
}

function extractNormalized(
  scene: THREE.Object3D,
  targetHeight: number,
  preRotateX = 0,
  preRotateY = 0,
): THREE.BufferGeometry {
  scene.updateWorldMatrix(true, true)
  const parts: THREE.BufferGeometry[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const g = mesh.geometry.clone()
      g.applyMatrix4(mesh.matrixWorld)
      parts.push(g)
    }
  })
  const merged = mergeGeometries(parts)
  // Axis corrections for models authored with a different "up" or
  // facing — applied before the bbox normalisation so height/base
  // maths see the upright shape.
  if (preRotateX !== 0) merged.rotateX(preRotateX)
  if (preRotateY !== 0) merged.rotateY(preRotateY)
  merged.computeBoundingBox()
  const bb = merged.boundingBox!
  const height = bb.max.y - bb.min.y || 1
  const scale = targetHeight / height
  const cx = (bb.min.x + bb.max.x) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  merged.translate(-cx, -bb.min.y, -cz)
  merged.scale(scale, scale, scale)
  merged.computeVertexNormals()
  return merged
}

/** Suspends until all six models are fetched (drei useGLTF). */
export function useGltfPieceGeometries(): Record<PieceSymbol, THREE.BufferGeometry> {
  const pawn = useGLTF(MODEL_URL.p)
  const rook = useGLTF(MODEL_URL.r)
  const knight = useGLTF(MODEL_URL.n)
  const bishop = useGLTF(MODEL_URL.b)
  const queen = useGLTF(MODEL_URL.q)
  const king = useGLTF(MODEL_URL.k)
  return useMemo(
    () => ({
      p: extractNormalized(pawn.scene, TARGET_HEIGHT.p),
      // The rook model is authored Z-up — stand it on its base.
      r: extractNormalized(rook.scene, TARGET_HEIGHT.r, -Math.PI / 2),
      // Knight: Z-up AND faces sideways once upright — stand it, then
      // turn it 90° clockwise (viewed from above) to face the enemy.
      n: extractNormalized(knight.scene, TARGET_HEIGHT.n, -Math.PI / 2, -Math.PI / 2),
      b: extractNormalized(bishop.scene, TARGET_HEIGHT.b),
      q: extractNormalized(queen.scene, TARGET_HEIGHT.q),
      k: extractNormalized(king.scene, TARGET_HEIGHT.k),
    }),
    [pawn, rook, knight, bishop, queen, king],
  )
}
