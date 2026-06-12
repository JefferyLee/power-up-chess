// Hall ambient details — a grand painterly stone hearth (bottom-left)
// and a glowing arched window (top-right), generated with the same
// Replicate pipeline as the door art. Pure visual; no interaction, no
// layout impact (position: fixed inside the Hall root with
// pointer-events: none).
//
// Animation recipe (door-proven): the artwork is duplicated as a
// mix-blend-mode: screen layer whose opacity flickers — the painting
// itself appears to brighten and dim like live firelight. Embers are
// plain CSS dots drifting up from the firebox. A large radial "room
// glow" breathes with the fire so the corner feels lit, not pasted.

import './HallAmbient.css'

const HALL_ART_VERSION = '2'

const FIREPLACE_SRC = `/sprites/hall/fireplace.png?v=${HALL_ART_VERSION}`
const WINDOW_SRC = `/sprites/hall/window.png?v=${HALL_ART_VERSION}`

export function HallAmbient() {
  return (
    <div className="puc-ambient" aria-hidden="true">
      {/* Warm light pooling across the lower-left of the room,
        * breathing in rhythm with the fire. */}
      <div className="puc-ambient__roomglow" />

      <div className="puc-ambient__fireplace">
        <img className="puc-ambient__fireplace-img" src={FIREPLACE_SRC} alt="" />
        <img className="puc-ambient__fireplace-fire" src={FIREPLACE_SRC} alt="" />
        {/* Big SVG flames dancing over the painted fire — three tongues
          * flickering out of phase, screen-blended into the artwork. */}
        <svg className="puc-ambient__flames" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="puc-flame-grad" cx="50%" cy="82%" r="62%">
              <stop offset="0%" stopColor="#fff3a8" stopOpacity="1" />
              <stop offset="40%" stopColor="#f6a23d" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#b03a18" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            className="puc-ambient__flame puc-ambient__flame--1"
            d="M34 136 Q24 100 40 62 Q46 84 50 106 Q56 76 62 96 Q58 124 46 136 Z"
            fill="url(#puc-flame-grad)"
          />
          <path
            className="puc-ambient__flame puc-ambient__flame--2"
            d="M54 138 Q44 86 62 30 Q68 62 72 96 Q78 58 84 86 Q82 122 68 138 Z"
            fill="url(#puc-flame-grad)"
          />
          <path
            className="puc-ambient__flame puc-ambient__flame--3"
            d="M78 136 Q70 104 84 70 Q90 88 92 108 Q98 86 102 102 Q98 126 88 136 Z"
            fill="url(#puc-flame-grad)"
          />
        </svg>
        <span className="puc-ambient__ember puc-ambient__ember--1" />
        <span className="puc-ambient__ember puc-ambient__ember--2" />
        <span className="puc-ambient__ember puc-ambient__ember--3" />
      </div>

      <div className="puc-ambient__window">
        <img className="puc-ambient__window-img" src={WINDOW_SRC} alt="" />
        <img className="puc-ambient__window-glow" src={WINDOW_SRC} alt="" />
        <div className="puc-ambient__shaft" />
      </div>
    </div>
  )
}
