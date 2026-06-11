// Procedural low-poly chess piece geometry. Every piece except the
// knight is a lathe (surface of revolution) — the classic Staunton
// silhouette reduced to a kid-friendly, chunky profile. The knight is
// a small assembly of boxes approximating a horse head.
//
// Profiles are defined as (radius, height) pairs from base (y=0)
// upward, in board-square units where a square is 1×1 and a pawn
// stands ~0.55 tall. Lathe segments stay low (12) for the toy-like
// look and mobile-friendly triangle counts.

import * as THREE from 'three'
import type { PieceSymbol } from '../chess/types'

const SEGMENTS = 12

function lathe(profile: Array<[number, number]>): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  const geo = new THREE.LatheGeometry(pts, SEGMENTS)
  geo.computeVertexNormals()
  return geo
}

function base(r: number): Array<[number, number]> {
  return [
    [0, 0],
    [r, 0],
    [r, 0.06],
    [r * 0.82, 0.1],
  ]
}

function makePawn(): THREE.BufferGeometry {
  return lathe([
    ...base(0.26),
    [0.16, 0.16],
    [0.13, 0.3],
    [0.18, 0.34],
    [0.12, 0.38],
    [0.16, 0.46],
    [0.1, 0.54],
    [0, 0.57],
  ])
}

function makeRook(): THREE.BufferGeometry {
  return lathe([
    ...base(0.3),
    [0.2, 0.18],
    [0.17, 0.42],
    [0.24, 0.46],
    [0.24, 0.6],
    [0.18, 0.6],
    [0.18, 0.52],
    [0, 0.52],
  ])
}

function makeBishop(): THREE.BufferGeometry {
  return lathe([
    ...base(0.28),
    [0.17, 0.18],
    [0.12, 0.42],
    [0.17, 0.48],
    [0.13, 0.56],
    [0.15, 0.62],
    [0.07, 0.72],
    [0.045, 0.74],
    [0.045, 0.78],
    [0, 0.8],
  ])
}

function makeQueen(): THREE.BufferGeometry {
  return lathe([
    ...base(0.31),
    [0.19, 0.2],
    [0.13, 0.5],
    [0.2, 0.58],
    [0.14, 0.66],
    [0.19, 0.76],
    [0.12, 0.82],
    [0.06, 0.86],
    [0.06, 0.9],
    [0, 0.92],
  ])
}

function makeKing(): THREE.BufferGeometry {
  const body = lathe([
    ...base(0.32),
    [0.2, 0.2],
    [0.14, 0.52],
    [0.21, 0.6],
    [0.15, 0.68],
    [0.2, 0.8],
    [0.1, 0.86],
    [0.05, 0.88],
  ])
  // Cross on top — two thin boxes merged in.
  const vert = new THREE.BoxGeometry(0.05, 0.18, 0.05)
  vert.translate(0, 0.99, 0)
  const horiz = new THREE.BoxGeometry(0.14, 0.05, 0.05)
  horiz.translate(0, 1.0, 0)
  return mergeGeometries([body, vert, horiz])
}

function makeKnight(): THREE.BufferGeometry {
  // Stylised horse head from boxes: base + neck (tilted) + head +
  // muzzle + two ears. Reads clearly at board scale without a model.
  const parts: THREE.BufferGeometry[] = []
  const baseGeo = lathe([...base(0.29), [0.2, 0.16], [0.17, 0.22], [0, 0.22]])
  parts.push(baseGeo)

  const neck = new THREE.BoxGeometry(0.18, 0.42, 0.26)
  neck.rotateX(-0.35)
  neck.translate(0, 0.42, -0.02)
  parts.push(neck)

  const head = new THREE.BoxGeometry(0.16, 0.16, 0.34)
  head.rotateX(0.15)
  head.translate(0, 0.62, 0.12)
  parts.push(head)

  const muzzle = new THREE.BoxGeometry(0.12, 0.1, 0.12)
  muzzle.translate(0, 0.58, 0.3)
  parts.push(muzzle)

  const earL = new THREE.BoxGeometry(0.045, 0.12, 0.045)
  earL.rotateX(-0.2)
  earL.translate(-0.05, 0.74, 0.02)
  parts.push(earL)
  const earR = earL.clone()
  earR.translate(0.1, 0, 0)
  parts.push(earR)

  return mergeGeometries(parts)
}

/** Minimal geometry merge (positions + normals) — avoids pulling in
 *  the three/examples BufferGeometryUtils module for one use. All
 *  inputs are non-indexed after toNonIndexed(). Shared with the GLTF
 *  piece loader (gltfPieces.ts). */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  let total = 0
  for (const g of nonIndexed) total += g.attributes.position!.count
  const pos = new Float32Array(total * 3)
  const norm = new Float32Array(total * 3)
  let offset = 0
  for (const g of nonIndexed) {
    pos.set(g.attributes.position!.array as Float32Array, offset * 3)
    norm.set(g.attributes.normal!.array as Float32Array, offset * 3)
    offset += g.attributes.position!.count
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3))
  return merged
}

/** Build once, share across all piece instances. */
let cache: Record<PieceSymbol, THREE.BufferGeometry> | null = null

export function pieceGeometries(): Record<PieceSymbol, THREE.BufferGeometry> {
  if (!cache) {
    cache = {
      p: makePawn(),
      r: makeRook(),
      n: makeKnight(),
      b: makeBishop(),
      q: makeQueen(),
      k: makeKing(),
    }
  }
  return cache
}
