// Stylised host portraits, hand-drawn in SVG.
//
// Placeholder for real anime artwork until proper assets land. Each portrait
// has its own colour palette + a couple of host-specific touches (Lucy
// carries a tiny leaf; Luca's hair has a star). The component layout makes
// the swap to a PNG/WEBP trivial later — just replace the SVG with <img>.
//
// Mood overlays: the base art is "happy" by default. For 'thinking' and
// 'cheering' we overdraw the mouth/eyes/effects on top of the base, so
// the heavy hair + face + accessory artwork is reused unchanged. This
// keeps the three moods visually consistent — same character, different
// expression — without needing six full PNGs.

import type { HostId } from '../hosts/hosts'

export type HostMood = 'happy' | 'thinking' | 'cheering'

interface Props {
  hostId: HostId
  variant?: 'lobby' | 'chip'
  mood?: HostMood
}

export function HostPortrait({ hostId, variant = 'lobby', mood = 'happy' }: Props) {
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
      className={`puc-portrait puc-portrait--${variant} puc-portrait--${hostId} puc-portrait--${mood}`}
      role="img"
      aria-label={`${isLucy ? 'Lucy' : 'Luca'}, host${mood === 'happy' ? '' : ` (${mood})`}`}
    >
      {isLucy ? <LucyArt /> : <LucaArt />}
      {mood !== 'happy' && (
        isLucy
          ? <LucyMoodOverlay mood={mood} />
          : <LucaMoodOverlay mood={mood} />
      )}
    </svg>
  )
}

/** Mood overlay for Lucy. Overdraws the default mouth (in skin colour
 *  to mask it) then redraws the mouth + eyes for thinking/cheering. */
function LucyMoodOverlay({ mood }: { mood: 'thinking' | 'cheering' }) {
  return (
    <g>
      {/* Mask the default smile + lower-lip blush with a face-tone wash. */}
      <ellipse cx="120" cy="170" rx="20" ry="8" fill="#f4d5bb" />
      {mood === 'thinking' ? (
        <>
          {/* Pursed mouth — a small upside-down comma to one side. */}
          <path d="M 114 170 Q 118 168 120 171" stroke="#5a2818" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          {/* Eyes look up + to the side. Mask + redraw irises shifted up-left. */}
          <ellipse cx="102" cy="132" rx="10" ry="13" fill="#fffbe8" />
          <ellipse cx="138" cy="132" rx="10" ry="13" fill="#fffbe8" />
          <ellipse cx="100" cy="130" rx="6.5" ry="8" fill="#7a3e1a" />
          <ellipse cx="136" cy="130" rx="6.5" ry="8" fill="#7a3e1a" />
          <circle cx="102" cy="127" r="2" fill="#fff" />
          <circle cx="138" cy="127" r="2" fill="#fff" />
          {/* One brow lifted asymmetrically — the "hm…" tell. */}
          <path d="M 127 110 Q 138 105 149 112" stroke="#3a1c08" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Hand near chin tucked off-canvas — represent by tiny chin dot finger. */}
          <circle cx="134" cy="185" r="3" fill="#f3c9a7" stroke="#a07050" strokeWidth="0.6" />
        </>
      ) : (
        <>
          {/* Open mouth — wide cheery O. */}
          <ellipse cx="120" cy="172" rx="8" ry="8" fill="#5a2818" />
          <ellipse cx="120" cy="174" rx="5" ry="4" fill="#c3525a" />
          {/* Eyes scrunched happy — replace round eyes with curved arcs. */}
          <ellipse cx="102" cy="134" rx="11" ry="13" fill="#f4d5bb" />
          <ellipse cx="138" cy="134" rx="11" ry="13" fill="#f4d5bb" />
          <path d="M 94 134 Q 102 124 110 134" stroke="#3a1c08" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 130 134 Q 138 124 146 134" stroke="#3a1c08" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Sparkle bursts top-left + top-right of the face. */}
          <g fill="#fff7d8">
            <polygon points="50,40 52,46 58,48 52,50 50,56 48,50 42,48 48,46" />
            <polygon points="194,46 196,52 202,54 196,56 194,62 192,56 186,54 192,52" />
            <circle cx="40" cy="100" r="2" />
            <circle cx="200" cy="106" r="2" />
          </g>
        </>
      )}
    </g>
  )
}

/** Mood overlay for Luca. Same pattern. */
function LucaMoodOverlay({ mood }: { mood: 'thinking' | 'cheering' }) {
  return (
    <g>
      <ellipse cx="120" cy="173" rx="20" ry="8" fill="#e8c0a0" />
      {mood === 'thinking' ? (
        <>
          {/* Quiet considering line — slightly asymmetrical. */}
          <path d="M 110 172 Q 120 170 132 174" stroke="#3a1838" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          {/* Eyes look up-right — chess-position-evaluation tell. */}
          <ellipse cx="103" cy="138" rx="9.5" ry="10" fill="#fffbe8" />
          <ellipse cx="137" cy="138" rx="9.5" ry="10" fill="#fffbe8" />
          <ellipse cx="106" cy="135" rx="6.5" ry="8" fill="#5e3aa0" />
          <ellipse cx="140" cy="135" rx="6.5" ry="8" fill="#5e3aa0" />
          <circle cx="107" cy="133" r="2.4" fill="#1a0830" />
          <circle cx="141" cy="133" r="2.4" fill="#1a0830" />
          {/* One brow furrowed. */}
          <path d="M 90 119 Q 102 122 114 119" stroke="#0c0820" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Thought sparkle near temple — Luca's "I see it" gesture. */}
          <g fill="#c8b6ff">
            <circle cx="50" cy="110" r="2" />
            <circle cx="46" cy="120" r="1.4" />
            <circle cx="54" cy="124" r="1.2" />
          </g>
        </>
      ) : (
        <>
          {/* Bigger smile — straighter teeth, still composed. */}
          <path d="M 102 169 Q 120 184 138 165" stroke="#3a1838" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M 108 172 Q 120 178 132 170" fill="rgba(180,80,80,0.4)" />
          {/* Eyes brighter, slightly wider — Luca's quiet "I knew you could". */}
          <ellipse cx="103" cy="138" rx="10" ry="11" fill="#fffbe8" />
          <ellipse cx="137" cy="138" rx="10" ry="11" fill="#fffbe8" />
          <ellipse cx="103" cy="140" rx="7" ry="9" fill="#5e3aa0" />
          <ellipse cx="137" cy="140" rx="7" ry="9" fill="#5e3aa0" />
          <circle cx="106" cy="135" r="3" fill="#fff" />
          <circle cx="140" cy="135" r="3" fill="#fff" />
          <circle cx="103" cy="142" r="2.4" fill="#1a0830" />
          <circle cx="137" cy="142" r="2.4" fill="#1a0830" />
          {/* Star burst near each shoulder — Luca's signature cheer. */}
          <g fill="#fff7d8" stroke="#a87a18" strokeWidth="0.6">
            <polygon points="46,52 49,60 56,62 49,64 46,72 43,64 36,62 43,60" />
            <polygon points="194,58 197,66 204,68 197,70 194,78 191,70 184,68 191,66" />
          </g>
        </>
      )}
    </g>
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
          <stop offset="100%" stopColor="#0a0618" />
        </linearGradient>
        <linearGradient id="luca-hair-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(180, 150, 255, 0.55)" />
          <stop offset="100%" stopColor="rgba(180, 150, 255, 0)" />
        </linearGradient>
        <linearGradient id="luca-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#f3d2b2" />
          <stop offset="100%" stopColor="#d6a682" />
        </linearGradient>
        <radialGradient id="luca-cheek" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(196,120,150,0.35)" />
          <stop offset="100%" stopColor="rgba(196,120,150,0)" />
        </radialGradient>
      </defs>

      {/* Background — night sky with stars + crescent moon. */}
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
      <g transform="translate(182, 54)">
        <circle cx="0" cy="0" r="13" fill="#fff7d8" />
        <circle cx="5" cy="-2" r="11" fill="url(#luca-bg)" />
      </g>

      {/* Face — slimmer with a defined-but-not-harsh jaw. Drawn first
       *  so the hair on top sits ON the head, not floating around it. */}
      <path
        d="M 82 126
           Q 82 92 120 88
           Q 158 92 158 126
           L 156 158
           Q 150 184 120 188
           Q 90 184 84 158 Z"
        fill="url(#luca-skin)"
      />

      {/* Subtle cheekbone shadow for a young-man read without harshness. */}
      <path d="M 86 162 Q 100 174 116 168" stroke="rgba(160, 90, 60, 0.2)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 124 168 Q 140 174 154 162" stroke="rgba(160, 90, 60, 0.2)" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* Cheeks — barely there. */}
      <circle cx="96"  cy="158" r="7" fill="url(#luca-cheek)" />
      <circle cx="144" cy="158" r="7" fill="url(#luca-cheek)" />

      {/* Ears — small, hugging the head. */}
      <ellipse cx="80" cy="140" rx="4" ry="8" fill="url(#luca-skin)" stroke="#a07058" strokeWidth="0.7" />
      <ellipse cx="160" cy="140" rx="4" ry="8" fill="url(#luca-skin)" stroke="#a07058" strokeWidth="0.7" />

      {/* Eyes — sharper than Lucy's (less round, more almond), bright
       *  violet irises, single eyelid line instead of fanned lashes. */}
      <g>
        <ellipse cx="103" cy="138" rx="9.5" ry="10" fill="#fffbe8" />
        <ellipse cx="137" cy="138" rx="9.5" ry="10" fill="#fffbe8" />
        <ellipse cx="103" cy="140" rx="6.5" ry="8" fill="#5e3aa0" />
        <ellipse cx="137" cy="140" rx="6.5" ry="8" fill="#5e3aa0" />
        {/* Pupils */}
        <circle  cx="103" cy="141" r="2.6" fill="#1a0830" />
        <circle  cx="137" cy="141" r="2.6" fill="#1a0830" />
        {/* Catchlights — single big highlight + tiny lower one (looks alive) */}
        <circle  cx="106" cy="135" r="2.4" fill="#fff" />
        <circle  cx="140" cy="135" r="2.4" fill="#fff" />
        <circle  cx="100" cy="143" r="1.0" fill="#fff" opacity="0.8" />
        <circle  cx="134" cy="143" r="1.0" fill="#fff" opacity="0.8" />
        {/* Upper eyelid line — one clean stroke per eye, no fanned lashes */}
        <path d="M 93 130 Q 103 127 113 131" stroke="#0a0618" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <path d="M 127 131 Q 137 127 147 130" stroke="#0a0618" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        {/* Brows — solid, slight arch, confident but not stern. */}
        <path d="M 90 120 Q 102 116 114 120" stroke="#0c0820" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M 126 120 Q 138 116 150 120" stroke="#0c0820" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      {/* Nose — small ridge + soft underside, giving a tiny bit of structure
       *  without overdoing it. */}
      <path d="M 119 148 L 118 160 Q 120 163 122 160 L 121 148" stroke="#a07060" strokeWidth="1.4" fill="none" strokeLinecap="round" />

      {/* Confident half-smile — slightly higher on the right than the left
       *  so he reads as quietly amused rather than blank. */}
      <path d="M 105 173 Q 120 180 138 169" stroke="#3a1838" strokeWidth="2.4" fill="none" strokeLinecap="round" />

      {/* Hair — clearly short, "longer-on-top" cut with a side-part fringe
       *  sweeping right. Built as three layered shapes so it reads as
       *  volume rather than flat color:
       *    1. Tight short sides hugging the head above the ears.
       *    2. The top mass that sits ON the crown.
       *    3. A sharp side-swept fringe across the right brow.
       */}

      {/* (1) Sides — short, tight to the head, just above + behind ears */}
      <path
        d="M 78 132
           Q 76 116 84 104
           Q 92 96 100 94
           L 96 118
           Q 86 124 80 134 Z"
        fill="url(#luca-hair)"
      />
      <path
        d="M 162 132
           Q 164 116 156 104
           Q 148 96 140 94
           L 144 118
           Q 154 124 160 134 Z"
        fill="url(#luca-hair)"
      />

      {/* (2) Top mass — sits ON the crown, taller in the middle, shorter
       *  toward the temples. Reads as "longer on top" cleanly. */}
      <path
        d="M 82 106
           Q 86 70 120 64
           Q 154 70 158 106
           L 154 102
           Q 150 80 120 78
           Q 90 80 86 102 Z"
        fill="url(#luca-hair)"
      />

      {/* (3) Side-swept fringe — sharp diagonal sweep from the part
       *  (around x=128) down across the right brow. The signature shape
       *  that makes him read as a young man with intentional hair. */}
      <path
        d="M 128 76
           Q 116 88 100 110
           Q 94 120 102 124
           Q 116 110 134 100
           Q 146 94 152 88
           Q 142 78 128 76 Z"
        fill="url(#luca-hair)"
      />

      {/* Hair shine — thin highlight streak along the top of the crown so
       *  the dark mass picks up the indigo sky-light. */}
      <path
        d="M 96 88 Q 122 72 152 84 L 148 96 Q 124 82 100 96 Z"
        fill="url(#luca-hair-shine)"
        opacity="0.7"
      />

      {/* Star clip — small, tucked into the part on the left where the
       *  fringe begins its sweep. Subtle accent, not centerpiece. */}
      <g transform="translate(98, 92) rotate(-15)">
        <polygon
          points="0,-8 2.4,-2.4 8,-2.4 3.2,1.4 5,7.4 0,3.7 -5,7.4 -3.2,1.4 -8,-2.4 -2.4,-2.4"
          fill="#f6e3a1"
          stroke="#a87a18"
          strokeWidth="0.8"
        />
      </g>

      {/* Cozy high collar — single dark blue/violet tone with a roll. */}
      <path d="M 30 240 Q 40 196 78 192 L 162 192 Q 200 196 210 240 Z" fill="#2a1a58" />
      <path
        d="M 78 192 Q 100 208 120 210 Q 140 208 162 192 L 162 198 Q 140 214 120 216 Q 100 214 78 198 Z"
        fill="#1a1038"
      />
    </>
  )
}
