// Hall ambient details — a flickering hearth and a glowing window
// pinned to the screen corners as decorative SVG. Pure visual; no
// interaction, no layout impact (position: fixed inside the Hall
// root with pointer-events: none).

import './HallAmbient.css'

export function HallAmbient() {
  return (
    <div className="puc-ambient" aria-hidden="true">
      {/* Bottom-left: stone hearth with three flames that flicker out of
       *  phase via CSS keyframes. Three flames give a more organic
       *  feel than one, without needing JS. */}
      <svg
        className="puc-ambient__fireplace"
        viewBox="0 0 120 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="puc-flame-grad" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor="#fff3a8" stopOpacity="1" />
            <stop offset="40%" stopColor="#f6a23d" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#b03a18" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="puc-ember-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd86b" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7a2a10" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Hearth opening + stones */}
        <rect x="6" y="100" width="108" height="36" rx="3" fill="#1a1108" />
        <rect x="6" y="100" width="108" height="36" rx="3" fill="none" stroke="#3a2618" strokeWidth="1.5" />
        <path d="M22 132 L22 96 Q60 78 98 96 L98 132 Z" fill="#0a0604" />
        {/* Mantel above */}
        <rect x="0" y="92" width="120" height="10" rx="2" fill="#2a1a10" />

        {/* Glow halo behind flames — slow breathe */}
        <ellipse
          className="puc-ambient__hearth-glow"
          cx="60"
          cy="118"
          rx="40"
          ry="22"
          fill="url(#puc-ember-grad)"
        />

        {/* Three flames, staggered animations */}
        <path
          className="puc-ambient__flame puc-ambient__flame--1"
          d="M40 128 Q34 108 44 92 Q48 102 50 116 Q54 100 58 112 Q56 124 48 128 Z"
          fill="url(#puc-flame-grad)"
        />
        <path
          className="puc-ambient__flame puc-ambient__flame--2"
          d="M56 130 Q50 102 62 82 Q66 96 68 112 Q72 92 76 108 Q74 128 64 130 Z"
          fill="url(#puc-flame-grad)"
        />
        <path
          className="puc-ambient__flame puc-ambient__flame--3"
          d="M76 128 Q70 110 80 96 Q84 106 86 118 Q90 104 92 116 Q88 126 80 128 Z"
          fill="url(#puc-flame-grad)"
        />
      </svg>

      {/* Top-right: tall arched window with a warm dawn-light glow that
       *  slowly brightens and dims like a window-pulse from a long way
       *  off. */}
      <svg
        className="puc-ambient__window"
        viewBox="0 0 90 160"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="puc-window-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff0c0" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#f6c266" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7a4a18" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {/* Outer stone frame */}
        <path
          d="M8 40 Q8 8 45 8 Q82 8 82 40 L82 152 L8 152 Z"
          fill="#0e0a06"
          stroke="#2a1a10"
          strokeWidth="3"
        />

        {/* Glowing inner pane — pulses */}
        <path
          className="puc-ambient__window-glow"
          d="M16 42 Q16 16 45 16 Q74 16 74 42 L74 144 L16 144 Z"
          fill="url(#puc-window-grad)"
        />

        {/* Cross mullions */}
        <line x1="45" y1="16" x2="45" y2="144" stroke="#2a1a10" strokeWidth="3" />
        <line x1="16" y1="80" x2="74" y2="80" stroke="#2a1a10" strokeWidth="3" />
        <line x1="16" y1="118" x2="74" y2="118" stroke="#2a1a10" strokeWidth="3" />
      </svg>
    </div>
  )
}
