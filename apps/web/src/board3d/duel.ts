// duel — the capture choreography for Board3D. chess.js has already
// decided the capture; this is pure theatre, and deliberately gore-
// free: the attacker walks up, feints twice (the victim reels and
// sparks fly), then hops onto the square while the victim pops like a
// balloon and re-materialises in the tray (Board3D's DyingPiece).
//
// Shape borrowed from Battle Chess: one Timeline drives both meshes,
// with cues for sparks / sound / landing, and Skip = rate ramp, not a
// cut. The DuelState is a plain mutable record shared with the piece
// meshes (via Board3D's DuelContext ref): they hand their meshes over
// and poll `popped`/`done` from their frame loops. Meshes are read LIVE
// every tick, so a mid-duel remount (procedural → GLTF pieces) simply
// re-registers.

import * as THREE from 'three'
import type { Square as SquareName } from '../chess/types'
import { Timeline, easeInOutCubic, easeOutBack, easeOutCubic, type Key } from './timeline'

export interface DuelState {
  /** The victim's tracking id (one duel per capture). */
  id: string
  attackerId: string
  toSquare: SquareName
  /** World x/z: attacker start, attacker destination, victim's square.
   *  `victim` equals `to` except for en passant. */
  from: [number, number]
  to: [number, number]
  victim: [number, number]
  /** Knight attacker — arcs in instead of gliding. */
  hop: boolean
  attacker: THREE.Object3D | null
  victimMesh: THREE.Object3D | null
  victimBase: THREE.Quaternion | null
  /** Set by the timeline when the victim should start popping —
   *  DyingPiece polls it from its frame loop. */
  popped: boolean
  timeline: Timeline | null
  skipRequested: boolean
  done: boolean
}

export interface DuelHooks {
  /** Blades meet — spawn sparks + play the clash at this world point. */
  onClash: (x: number, y: number, z: number) => void
  /** Attacker has landed on its square. */
  onLanded: () => void
}

const STANDOFF = 0.62
/** Knight arc height; sliders lift a touch so they read as picked up. */
export const HOP_HEIGHT = 0.8
export const LIFT = 0.12
const JUMP_HEIGHT = 0.35
const BEAT = 0.5

/** Approach duration by distance (squares) — same idea as ordinary
 *  moves, capped so a queen crossing the board never drags. */
export function moveDuration(dist: number): number {
  return Math.min(1.0, Math.max(0.4, 0.3 + 0.1 * dist))
}

export function buildDuel(d: DuelState, hooks: DuelHooks): Timeline {
  const [ax, az] = d.from
  const [tx, tz] = d.to
  const [vx, vz] = d.victim
  const enPassant = tx !== vx || tz !== vz
  // Where the attacker halts to fight: short of the victim on a normal
  // capture, on its own square for en passant (victim is alongside).
  let sx: number, sz: number
  if (enPassant) {
    sx = tx
    sz = tz
  } else {
    const len = Math.hypot(vx - ax, vz - az) || 1
    sx = vx - ((vx - ax) / len) * STANDOFF
    sz = vz - ((vz - az) / len) * STANDOFF
  }
  const llen = Math.hypot(vx - sx, vz - sz) || 1
  const lx = (vx - sx) / llen
  const lz = (vz - sz) / llen
  // Tip the victim's top AWAY from the attacker: rotate about the
  // horizontal axis perpendicular to the lunge direction.
  const tiltAxis = new THREE.Vector3(lz, 0, -lx)

  const tA = moveDuration(Math.hypot(sx - ax, sz - az))
  const t1 = tA + 0.12
  const t2 = t1 + BEAT
  const tF = t2 + BEAT
  const tEnd = tF + 0.26

  // p: approach 0→1, j: final hop 0→1, lunge: attacker feint along the
  // lunge axis, tilt/slide: the victim reeling.
  const s = { p: 0, j: 0, lunge: 0, tilt: 0, slide: 0 }
  const tl = new Timeline(tEnd + 0.05)
  tl.track(s, 'p', [{ t: 0, v: 0 }, { t: tA, v: 1, ease: easeInOutCubic }])
  tl.track(s, 'j', [{ t: tF, v: 0 }, { t: tF + 0.26, v: 1, ease: easeOutCubic }])
  const lungeKeys: Key[] = []
  const tiltKeys: Key[] = []
  for (const [ti, amp] of [[t1, 0.32], [t2, 0.5]] as const) {
    lungeKeys.push({ t: ti, v: 0 }, { t: ti + 0.11, v: 0.3, ease: easeOutCubic }, { t: ti + 0.34, v: 0, ease: easeInOutCubic })
    const c = ti + 0.09
    tiltKeys.push({ t: c, v: 0 }, { t: c + 0.08, v: amp, ease: easeOutCubic }, { t: c + 0.4, v: 0, ease: easeOutBack })
    tl.at(c, () => hooks.onClash(vx - lx * 0.3, 0.5, vz - lz * 0.3))
  }
  tl.track(s, 'lunge', lungeKeys)
  tl.track(s, 'tilt', tiltKeys)
  const c2 = t2 + 0.09
  tl.track(s, 'slide', [{ t: c2, v: 0 }, { t: c2 + 0.1, v: 0.14, ease: easeOutCubic }, { t: c2 + 0.4, v: 0.02, ease: easeInOutCubic }])
  tl.at(tF + 0.1, () => { d.popped = true })
  tl.at(tF + 0.26, () => hooks.onLanded())

  const q = new THREE.Quaternion()
  tl.onTick(() => {
    const a = d.attacker
    if (a) {
      const p = s.p
      const j = s.j
      a.position.x = ax + (sx - ax) * p + (tx - sx) * j + lx * s.lunge
      a.position.z = az + (sz - az) * p + (tz - sz) * j + lz * s.lunge
      const approachY = d.hop ? HOP_HEIGHT * 4 * p * (1 - p) : LIFT * Math.sin(Math.PI * p)
      a.position.y = approachY + JUMP_HEIGHT * 4 * j * (1 - j)
    }
    const v = d.victimMesh
    if (v && d.victimBase) {
      v.position.x = vx + lx * s.slide
      v.position.z = vz + lz * s.slide
      v.quaternion.copy(q.setFromAxisAngle(tiltAxis, s.tilt)).multiply(d.victimBase)
    }
  })
  return tl
}

/** Jump a duel to its end (or drop it before it ever built). */
export function finishDuel(d: DuelState): void {
  d.timeline?.finish()
  d.done = true
}
