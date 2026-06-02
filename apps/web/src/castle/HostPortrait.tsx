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
          <stop offset="0%"  stopColor="#c8b6ff" />
          <stop offset="55%" stopColor="#6a4ec9" />
          <stop offset="100%" stopColor="#1c1238" />
        </radialGradient>
        <linearGradient id="luca-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#3a2670" />
          <stop offset="100%" stopColor="#0c0820" />
        </linearGradient>
        <linearGradient id="luca-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fbe1c8" />
          <stop offset="100%" stopColor="#e8c2a3" />
        </linearGradient>
        <radialGradient id="luca-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(232,140,140,0.55)" />
          <stop offset="100%" stopColor="rgba(232,140,140,0)" />
        </radialGradient>
      </defs>

      {/* Background — night sky with stars + crescent moon. Same palette
       *  as before; Luca's signature is the night, Lucy's is dusk. */}
      <circle cx="120" cy="120" r="118" fill="url(#luca-bg)" stroke="#1a0f30" strokeWidth="3" />
      <g fill="#fff">
        <circle cx="46"  cy="54"  r="1.8" />
        <circle cx="194" cy="62"  r="2.2" />
        <circle cx="40"  cy="170" r="1.6" opacity="0.7" />
        <circle cx="200" cy="170" r="2.0" />
        <circle cx="74"  cy="38"  r="1.0" opacity="0.7" />
        <circle cx="22"  cy="120" r="1.2" opacity="0.7" />
        <circle cx="210" cy="118" r="1.0" opacity="0.7" />
      </g>
      <g transform="translate(180, 52)">
        <circle cx="0" cy="0" r="13" fill="#fff7d8" />
        <circle cx="5" cy="-2" r="11" fill="url(#luca-bg)" />
      </g>

      {/* Hair back — soft dark mass behind the head, fills the upper third
       *  of the portrait so the tousled fringe in front reads as a layer. */}
      <path
        d="M 56 122 Q 56 56 120 50 Q 184 56 184 122 L 184 200 L 56 200 Z"
        fill="url(#luca-hair)"
      />

      {/* Face — rounded and friendly (mirrors Lucy's structure). The old
       *  angular jaw made Luca look stern; this softer ellipse reads as
       *  kind without losing the boyish vibe (the hair carries that). */}
      <ellipse cx="120" cy="132" rx="52" ry="60" fill="url(#luca-skin)" />

      {/* Cheeks — same warmth as Lucy's so the pair feels matched. */}
      <circle cx="96"  cy="152" r="10" fill="url(#luca-cheek)" />
      <circle cx="144" cy="152" r="10" fill="url(#luca-cheek)" />

      {/* Big anime eyes — same structure as Lucy, in Luca's violet. */}
      <g>
        <ellipse cx="102" cy="134" rx="10" ry="13" fill="#fffbe8" />
        <ellipse cx="138" cy="134" rx="10" ry="13" fill="#fffbe8" />
        <ellipse cx="102" cy="136" rx="7"  ry="10" fill="#5e3aa0" />
        <ellipse cx="138" cy="136" rx="7"  ry="10" fill="#5e3aa0" />
        <circle  cx="104" cy="132" r="2.4" fill="#fff" />
        <circle  cx="140" cy="132" r="2.4" fill="#fff" />
        <circle  cx="100" cy="139" r="1.2" fill="#fff" opacity="0.85" />
        <circle  cx="136" cy="139" r="1.2" fill="#fff" opacity="0.85" />
        {/* Top eyelash */}
        <path d="M 92 126 Q 102 123 112 126" stroke="#0c0820" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M 128 126 Q 138 123 148 126" stroke="#0c0820" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {/* Soft upturned brows — warmer than the previous angular zigzags. */}
        <path d="M 91 117 Q 102 113 113 118" stroke="#1a0f30" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M 127 118 Q 138 113 149 117" stroke="#1a0f30" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>

      {/* Tiny nose */}
      <path d="M 118 156 Q 120 160 122 156" stroke="#a07050" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Smile (Lucy-style closed-mouth grin — was a wider teeth-showing
       *  grin which felt off against the softer face). */}
      <path d="M 108 170 Q 120 180 132 170" stroke="#3a1838" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M 113 172 Q 120 176 127 172" fill="rgba(180,80,80,0.45)" />

      {/* Tousled fringe — soft wavy hair sweeping across forehead instead
       *  of the prior zigzag spikes. Drawn as one continuous wavy band. */}
      <path
        d="M 60 116
           Q 76 78  100 88
           Q 116 82 130 90
           Q 152 80 178 102
           Q 184 112 184 122
           L 168 118
           Q 152 102 130 104
           Q 110 102 88  112
           Q 70  114 60 116 Z"
        fill="url(#luca-hair)"
      />

      {/* Two rounded tufts on top for a hint of bedhead. */}
      <path d="M 94 84 Q 104 70 116 80 Q 118 88 110 94 Q 100 92 94 84 Z" fill="url(#luca-hair)" />
      <path d="M 142 80 Q 152 70 162 82 Q 162 92 152 96 Q 144 92 142 80 Z" fill="url(#luca-hair)" />

      {/* Side hair flowing past the ears, matched to the back panel. */}
      <path d="M 56 130 Q 50 155 60 178 L 70 172 Q 64 152 66 132 Z" fill="url(#luca-hair)" />
      <path d="M 184 130 Q 190 155 180 178 L 170 172 Q 176 152 174 132 Z" fill="url(#luca-hair)" />

      {/* Star clip — bigger + with a soft inner highlight so it actually
       *  reads as Luca's signature instead of an afterthought. */}
      <g transform="translate(150, 78) rotate(14)">
        <polygon
          points="0,-13 3.8,-3.8 13,-3.8 5.2,2.2 8.1,12 0,5.8 -8.1,12 -5.2,2.2 -13,-3.8 -3.8,-3.8"
          fill="#f6e3a1"
          stroke="#a87a18"
          strokeWidth="1"
        />
        <polygon
          points="0,-7 2,-2 7,-2 3,1.4 4.5,6 0,3 -4.5,6 -3,1.4 -7,-2 -2,-2"
          fill="#fff7d8"
          opacity="0.6"
        />
      </g>

      {/* Cozy high collar — one tone with a rolled lip. Replaces the busy
       *  V-neck + lapel-pin combo. */}
      <path d="M 30 240 Q 40 198 78 196 L 162 196 Q 200 198 210 240 Z" fill="#3b2a78" />
      <path
        d="M 78 196 Q 100 210 120 212 Q 140 210 162 196 L 162 200 Q 140 214 120 216 Q 100 214 78 200 Z"
        fill="#2a1a58"
      />
    </>
  )
}
