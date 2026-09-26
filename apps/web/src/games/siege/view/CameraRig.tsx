// CameraRig — OrbitControls fitted to the map, plus the boss intro:
// while sim.state.bossIntro < 1 the camera eases from wherever the
// player left it toward the boss and back (controls off meanwhile) and
// a name banner floats over the boss. A skipped intro eases home too,
// rather than cutting.
import { useEffect, useMemo, useRef, useState, type ComponentRef, type CSSProperties } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { BossId, Sim } from '../sim/types'
import { bossDef, ENEMY_SCALE, enemyScale, fitCamera, PIECE_TOP, posX, posZ, symbolFor } from './world'

const CARD: CSSProperties = {
  background: 'rgba(12, 8, 16, 0.78)',
  border: '1px solid rgba(241, 195, 76, 0.45)',
  borderRadius: 12,
  padding: '14px 28px',
  textAlign: 'center',
  maxWidth: 460,
  opacity: 0,
  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
}

export function CameraRig({ sim }: { sim: Sim }) {
  const { cols, rows } = sim.map
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera } = useThree()
  const v = useMemo(
    () => ({
      home: new THREE.Vector3(),
      homeTarget: new THREE.Vector3(),
      boss: new THREE.Vector3(),
      close: new THREE.Vector3(),
      target: new THREE.Vector3(),
    }),
    [],
  )
  const intro = useRef(false)
  /** Blend weight home → close-up; follows bossIntro, then decays home. */
  const weight = useRef(0)
  const [banner, setBanner] = useState<BossId | null>(null)
  const bannerGroup = useRef<THREE.Group>(null)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : undefined
    const [x, y, z] = fitCamera(cols, rows, aspect)
    camera.position.set(x, y, z)
    const c = controls.current
    if (c) {
      c.target.set(0, 0, 0)
      c.update()
    }
  }, [camera, cols, rows])

  useFrame((_, dt) => {
    const st = sim.state
    const c = controls.current
    if (!c) return
    const running = st.bossIntro < 1
    if (running && !intro.current) {
      intro.current = true
      v.home.copy(camera.position)
      v.homeTarget.copy(c.target)
      c.enabled = false
      setBanner(st.introBoss)
    }
    if (!running && intro.current) {
      intro.current = false
      setBanner(null)
    }
    if (running) {
      weight.current = 0.5 - 0.5 * Math.cos(2 * Math.PI * st.bossIntro)
      const b = st.boss
      if (b) {
        v.boss.set(posX(b.pos.x, cols), 0, posZ(b.pos.y, rows))
        const len = Math.hypot(b.dir.x, b.dir.y)
        const dx = len > 0.01 ? b.dir.x / len : 0
        const dz = len > 0.01 ? b.dir.y / len : 1
        v.close.set(v.boss.x + dx * 2.8, 2.1, v.boss.z + dz * 2.8)
        const top = PIECE_TOP[symbolFor(b.type)] * ENEMY_SCALE * enemyScale(b.type)
        if (bannerGroup.current) bannerGroup.current.position.set(v.boss.x, top + 0.6, v.boss.z)
      }
      if (card.current) card.current.style.opacity = String(Math.min(1, weight.current * 1.5))
    } else if (!c.enabled) {
      // Easing home after the intro ended or was skipped.
      weight.current *= Math.pow(0.02, dt)
      if (weight.current < 0.01) {
        weight.current = 0
        camera.position.copy(v.home)
        c.target.copy(v.homeTarget)
        c.enabled = true
        c.update()
        return
      }
    } else {
      return
    }
    const w = weight.current
    camera.position.lerpVectors(v.home, v.close, w)
    v.target.lerpVectors(v.homeTarget, v.boss, w)
    camera.lookAt(v.target)
  })

  const def = banner ? bossDef(banner) : null
  return (
    <>
      <OrbitControls ref={controls} enablePan={false} minPolarAngle={0.35} maxPolarAngle={1.25} minDistance={8} maxDistance={26} />
      <group ref={bannerGroup}>
        {def && (
          <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div ref={card} style={CARD}>
              <div style={{ font: '700 34px Cinzel, Georgia, serif', color: '#f1c34c', letterSpacing: 1, whiteSpace: 'nowrap' }}>{def.name}</div>
              {def.title && <div style={{ font: '500 16px Cinzel, Georgia, serif', color: '#e8dcc0', marginTop: 4 }}>{def.title}</div>}
              {def.intro && <div style={{ font: 'italic 15px "IM Fell English", Georgia, serif', color: '#cfc4ad', marginTop: 10 }}>{def.intro}</div>}
            </div>
          </Html>
        )}
      </group>
    </>
  )
}
