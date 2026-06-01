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
  const size = variant === 'chip' ? 48 : 220
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
          <stop offset="0%" stopColor="#f4d8c2" />
          <stop offset="100%" stopColor="#e0b89a" />
        </linearGradient>
        <radialGradient id="luca-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(196,120,150,0.55)" />
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
      </g>
      {/* A small crescent moon */}
      <g transform="translate(178, 50)">
        <circle cx="0" cy="0" r="11" fill="#fff7d8" />
        <circle cx="4" cy="-2" r="10" fill="url(#luca-bg)" />
      </g>

      {/* Hair back */}
      <path
        d="M 56 112 Q 56 50 120 48 Q 184 50 184 112 L 180 196 L 152 200 L 138 194 L 120 198 L 102 194 L 88 200 L 60 196 Z"
        fill="url(#luca-hair)"
      />

      {/* Face */}
      <ellipse cx="120" cy="128" rx="52" ry="60" fill="url(#luca-skin)" />
      {/* Cheeks */}
      <circle cx="96" cy="150" r="10" fill="url(#luca-cheek)" />
      <circle cx="144" cy="150" r="10" fill="url(#luca-cheek)" />

      {/* Eyes — violet for Luca */}
      <g>
        <ellipse cx="102" cy="132" rx="10" ry="13" fill="#fffbe8" />
        <ellipse cx="138" cy="132" rx="10" ry="13" fill="#fffbe8" />
        <ellipse cx="102" cy="134" rx="7" ry="10" fill="#5e3aa0" />
        <ellipse cx="138" cy="134" rx="7" ry="10" fill="#5e3aa0" />
        <circle cx="104" cy="130" r="2.4" fill="#fff" />
        <circle cx="140" cy="130" r="2.4" fill="#fff" />
        <circle cx="100" cy="137" r="1.2" fill="#fff" opacity="0.85" />
        <circle cx="136" cy="137" r="1.2" fill="#fff" opacity="0.85" />
        {/* Upper lash + brow */}
        <path d="M 92 124 Q 102 121 112 124" stroke="#0a061a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 128 124 Q 138 121 148 124" stroke="#0a061a" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 90 115 Q 102 110 114 116" stroke="#1a0f30" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M 126 116 Q 138 110 150 115" stroke="#1a0f30" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* Nose */}
      <path d="M 118 154 Q 120 158 122 154" stroke="#a07060" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Smile — wider, mischievous */}
      <path d="M 104 168 Q 120 180 136 168" stroke="#3a1838" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M 110 170 Q 120 175 130 170" fill="rgba(160,60,90,0.45)" />

      {/* Hair fringe — spikier than Lucy's */}
      <path
        d="M 60 108 L 76 88 L 86 110 L 100 80 L 112 108 L 126 78 L 138 108 L 152 84 L 164 108 L 180 92 L 182 116 L 60 116 Z"
        fill="url(#luca-hair)"
      />

      {/* Side bangs */}
      <path d="M 56 130 Q 52 158 60 180 L 72 174 Q 66 150 66 130 Z" fill="url(#luca-hair)" />
      <path d="M 184 130 Q 188 158 180 180 L 168 174 Q 174 150 174 130 Z" fill="url(#luca-hair)" />

      {/* Star clip in his hair (Luca's signature) */}
      <g transform="translate(78, 86)">
        <polygon
          points="0,-9 2.5,-2.5 9,-2.5 3.5,1.5 5.5,8 0,4 -5.5,8 -3.5,1.5 -9,-2.5 -2.5,-2.5"
          fill="#f6e3a1"
          stroke="#a87a18"
          strokeWidth="0.8"
        />
      </g>

      {/* Collar / shoulders */}
      <path d="M 30 240 Q 40 200 80 196 L 160 196 Q 200 200 210 240 Z" fill="#3b2a78" />
      <path d="M 96 196 Q 120 218 144 196 L 138 196 L 120 210 L 102 196 Z" fill="#e9e5ff" />
    </>
  )
}
