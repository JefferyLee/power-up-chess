// Stylised host portraits, hand-drawn in SVG.
//
// Placeholder for real anime artwork until proper assets land. Each portrait
// has its own colour palette + a couple of host-specific touches (Lucy
// carries a tiny leaf; Luca's hair has a star). The component layout makes
// the swap to a PNG/WEBP trivial later — just replace the SVG with <img>.

import type { HostId } from '../hosts/hosts'

interface Props {
  hostId: HostId
  variant?: 'lobby' | 'chip'
}

export function HostPortrait({ hostId, variant = 'lobby' }: Props) {
  const isLucy = hostId === 'lucy'
  // Lobby portrait was 220 — too dominant in the Hall's host column.
  // 120 reads as ambient support; the hero doors row above the host
  // card carries the primary visual weight.
  const size = variant === 'chip' ? 48 : 120
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      className={`puc-portrait puc-portrait--${variant} puc-portrait--${hostId}`}
      role="img"
      aria-label={isLucy ? 'Lucy, host' : 'Luca, host'}
    >
      {isLucy ? <LucyArt /> : <LucaArt />}
    </svg>
  )
}

function LucyArt() {
  return (
    <>
      <defs>
        <radialGradient id="lucy-bg" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f6e3a1" />
          <stop offset="55%" stopColor="#caa14a" />
          <stop offset="100%" stopColor="#5e3a18" />
        </radialGradient>
        <linearGradient id="lucy-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a3e1a" />
          <stop offset="100%" stopColor="#3a1c08" />
        </linearGradient>
        <linearGradient id="lucy-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe1c8" />
          <stop offset="100%" stopColor="#e8c2a3" />
        </linearGradient>
        <radialGradient id="lucy-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(232,140,140,0.55)" />
          <stop offset="100%" stopColor="rgba(232,140,140,0)" />
        </radialGradient>
      </defs>

      {/* Background */}
      <circle cx="120" cy="120" r="118" fill="url(#lucy-bg)" stroke="#2a1b0a" strokeWidth="3" />
      {/* A few floating motes — magic forest energy */}
      <circle cx="50" cy="60" r="3" fill="#fff7d8" opacity="0.7" />
      <circle cx="190" cy="70" r="2" fill="#fff7d8" opacity="0.6" />
      <circle cx="40" cy="180" r="2.5" fill="#fff7d8" opacity="0.6" />
      <circle cx="200" cy="180" r="2" fill="#fff7d8" opacity="0.55" />

      {/* Hair back */}
      <path
        d="M 60 110 Q 60 50 120 50 Q 180 50 180 110 L 178 196 L 152 200 L 138 196 L 120 200 L 102 196 L 88 200 L 62 196 Z"
        fill="url(#lucy-hair)"
      />

      {/* Face */}
      <ellipse cx="120" cy="128" rx="52" ry="60" fill="url(#lucy-skin)" />
      {/* Cheeks */}
      <circle cx="96" cy="148" r="10" fill="url(#lucy-cheek)" />
      <circle cx="144" cy="148" r="10" fill="url(#lucy-cheek)" />

      {/* Big anime eyes */}
      <g>
        {/* Whites */}
        <ellipse cx="102" cy="132" rx="10" ry="13" fill="#fffbe8" />
        <ellipse cx="138" cy="132" rx="10" ry="13" fill="#fffbe8" />
        {/* Irises (warm hazel) */}
        <ellipse cx="102" cy="134" rx="7" ry="10" fill="#7a3e1a" />
        <ellipse cx="138" cy="134" rx="7" ry="10" fill="#7a3e1a" />
        {/* Catchlights */}
        <circle cx="104" cy="130" r="2.4" fill="#fff" />
        <circle cx="140" cy="130" r="2.4" fill="#fff" />
        <circle cx="100" cy="137" r="1.2" fill="#fff" opacity="0.85" />
        <circle cx="136" cy="137" r="1.2" fill="#fff" opacity="0.85" />
        {/* Top eyelash */}
        <path d="M 92 124 Q 102 121 112 124" stroke="#2a1c0a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 128 124 Q 138 121 148 124" stroke="#2a1c0a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* Brows */}
        <path d="M 91 116 Q 102 112 113 117" stroke="#3a1c08" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M 127 117 Q 138 112 149 116" stroke="#3a1c08" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* Tiny nose */}
      <path d="M 118 154 Q 120 158 122 154" stroke="#a07050" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Smile */}
      <path d="M 108 168 Q 120 178 132 168" stroke="#5a2818" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M 113 170 Q 120 174 127 170" fill="rgba(180,80,80,0.5)" />

      {/* Hair fringe */}
      <path
        d="M 62 110 Q 90 70 120 76 Q 150 70 178 110 L 168 102 Q 144 86 120 92 Q 96 86 72 102 Z"
        fill="url(#lucy-hair)"
      />

      {/* Side hair tufts */}
      <path d="M 56 130 Q 50 150 60 175 L 70 170 Q 64 150 66 130 Z" fill="url(#lucy-hair)" />
      <path d="M 184 130 Q 190 150 180 175 L 170 170 Q 176 150 174 130 Z" fill="url(#lucy-hair)" />

      {/* Leaf accessory in the hair (Lucy's signature) */}
      <g transform="translate(150, 92) rotate(20)">
        <path d="M 0 0 Q 8 -12 22 -6 Q 14 4 0 0 Z" fill="#5e7a4b" stroke="#2a3e1f" strokeWidth="1" />
        <path d="M 2 -2 L 18 -7" stroke="#2a3e1f" strokeWidth="0.8" fill="none" />
      </g>

      {/* Collar / shoulders */}
      <path d="M 30 240 Q 40 200 80 196 L 160 196 Q 200 200 210 240 Z" fill="#5e7a4b" />
      <path d="M 96 196 Q 120 218 144 196 L 138 196 L 120 210 L 102 196 Z" fill="#fbf3da" />
    </>
  )
}

function LucaArt() {
  return (
    <>
      <defs>
        <radialGradient id="luca-bg" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#c8b6ff" />
          <stop offset="55%" stopColor="#6a4ec9" />
          <stop offset="100%" stopColor="#1c1238" />
        </radialGradient>
        <linearGradient id="luca-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1c4a" />
          <stop offset="100%" stopColor="#0a061a" />
        </linearGradient>
        <linearGradient id="luca-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0d2b8" />
          <stop offset="100%" stopColor="#d8aa8a" />
        </linearGradient>
        <radialGradient id="luca-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(196,120,150,0.4)" />
          <stop offset="100%" stopColor="rgba(196,120,150,0)" />
        </radialGradient>
      </defs>

      {/* Background — night sky */}
      <circle cx="120" cy="120" r="118" fill="url(#luca-bg)" stroke="#1a0f30" strokeWidth="3" />
      {/* Stars */}
      <g fill="#fff">
        <circle cx="46" cy="54" r="1.8" />
        <circle cx="194" cy="62" r="2.2" />
        <circle cx="40" cy="170" r="1.6" />
        <circle cx="200" cy="170" r="2.0" />
        <circle cx="74" cy="38" r="1.0" opacity="0.7" />
        <circle cx="166" cy="40" r="1.0" opacity="0.7" />
        <circle cx="22" cy="120" r="1.2" opacity="0.7" />
      </g>
      {/* Crescent moon */}
      <g transform="translate(178, 50)">
        <circle cx="0" cy="0" r="11" fill="#fff7d8" />
        <circle cx="4" cy="-2" r="10" fill="url(#luca-bg)" />
      </g>

      {/* Face — slightly squarer + shorter than Lucy's: jawline angles in,
          chin is a flat-ish curve. */}
      <path
        d="M 72 116 Q 70 80 90 70 L 150 70 Q 170 80 168 116 L 168 156 Q 162 188 120 192 Q 78 188 72 156 Z"
        fill="url(#luca-skin)"
      />
      {/* Jaw / chin shadow for definition */}
      <path d="M 82 168 Q 120 196 158 168" stroke="rgba(110, 70, 45, 0.25)" strokeWidth="2" fill="none" />

      {/* Cheeks — lighter than Lucy's, more subtle */}
      <circle cx="96" cy="148" r="9" fill="url(#luca-cheek)" />
      <circle cx="144" cy="148" r="9" fill="url(#luca-cheek)" />

      {/* Ears (boyish — slightly visible at sides) */}
      <ellipse cx="74" cy="130" rx="6" ry="11" fill="url(#luca-skin)" stroke="#a07058" strokeWidth="0.8" />
      <ellipse cx="166" cy="130" rx="6" ry="11" fill="url(#luca-skin)" stroke="#a07058" strokeWidth="0.8" />

      {/* Eyes — violet, slightly narrower than Lucy's */}
      <g>
        <ellipse cx="102" cy="132" rx="9" ry="11" fill="#fffbe8" />
        <ellipse cx="138" cy="132" rx="9" ry="11" fill="#fffbe8" />
        <ellipse cx="102" cy="133" rx="6.5" ry="9" fill="#5e3aa0" />
        <ellipse cx="138" cy="133" rx="6.5" ry="9" fill="#5e3aa0" />
        <circle cx="104" cy="130" r="2.4" fill="#fff" />
        <circle cx="140" cy="130" r="2.4" fill="#fff" />
        <circle cx="100" cy="136" r="1.1" fill="#fff" opacity="0.85" />
        <circle cx="136" cy="136" r="1.1" fill="#fff" opacity="0.85" />
        {/* Upper lash (thicker than Lucy's, more boyish "line" eye) */}
        <path d="M 93 124 Q 102 121 111 124" stroke="#0a061a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M 129 124 Q 138 121 147 124" stroke="#0a061a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* Thicker brows, sharper angle */}
        <path d="M 90 114 L 102 110 L 114 116" stroke="#1a0f30" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 126 116 L 138 110 L 150 114" stroke="#1a0f30" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Nose — small ridge line */}
      <path d="M 120 142 L 118 156 Q 120 160 122 156 L 120 142" stroke="#a07060" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Smile — wide grin showing a hint of teeth */}
      <path d="M 104 170 Q 120 182 136 170" stroke="#3a1838" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M 110 173 Q 120 178 130 173 L 130 175 Q 120 173 110 175 Z" fill="#fff8f0" />

      {/* Spiky boy hair — short on the back, only fringe + a couple of tufts */}
      <path
        d="M 64 116
           L 64 90
           L 76 70
           L 84 96
           L 96 64
           L 104 100
           L 116 60
           L 124 102
           L 138 64
           L 146 102
           L 158 72
           L 168 96
           L 176 80
           L 176 116
           L 64 116 Z"
        fill="url(#luca-hair)"
      />
      {/* A few short hair strands that come down in front of the ears */}
      <path d="M 72 116 L 70 132 L 78 130 L 76 116 Z" fill="url(#luca-hair)" />
      <path d="M 168 116 L 170 132 L 162 130 L 164 116 Z" fill="url(#luca-hair)" />

      {/* Star clip (Luca's signature) — moved into the hair on the right side */}
      <g transform="translate(154, 84)">
        <polygon
          points="0,-8 2.3,-2.3 8,-2.3 3.2,1.4 5,7 0,3.6 -5,7 -3.2,1.4 -8,-2.3 -2.3,-2.3"
          fill="#f6e3a1"
          stroke="#a87a18"
          strokeWidth="0.8"
        />
      </g>

      {/* Boyish high-collar shirt with a small star/lapel pin */}
      <path d="M 30 240 Q 40 200 78 196 L 162 196 Q 200 200 210 240 Z" fill="#3b2a78" />
      {/* Shirt collar — V-neck */}
      <path d="M 94 196 L 120 220 L 146 196 L 146 200 L 120 224 L 94 200 Z" fill="#1c1338" />
      {/* Lapel star pin */}
      <g transform="translate(108, 214)">
        <polygon points="0,-4 1.2,-1.2 4,-1.2 1.5,0.7 2.5,3.5 0,1.8 -2.5,3.5 -1.5,0.7 -4,-1.2 -1.2,-1.2" fill="#f6e3a1" />
      </g>
    </>
  )
}
