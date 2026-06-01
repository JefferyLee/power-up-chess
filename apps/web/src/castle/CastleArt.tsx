// Stylised castle SVG. Neutral palette per MVP2_PLAN §12.8 — the theme
// reveals only after the visitor enters. Two side towers, a central
// arched gate, two small wickets on the gate, a banner with the castle
// initial. The right-side wicket animates open through the `phase` prop.

interface Props {
  phase: 'closed' | 'opening' | 'open'
}

export function CastleArt({ phase }: Props) {
  return (
    <svg
      viewBox="0 0 480 360"
      className="puc-castle-art"
      role="img"
      aria-label="Power Up Castle gate"
    >
      {/* Sky gradient backdrop (very soft). */}
      <defs>
        <linearGradient id="puc-castle-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b3148" />
          <stop offset="100%" stopColor="#5f5572" />
        </linearGradient>
        <linearGradient id="puc-castle-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9a8c7c" />
          <stop offset="100%" stopColor="#6a5e52" />
        </linearGradient>
        <linearGradient id="puc-castle-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a3e3e" />
          <stop offset="100%" stopColor="#4d2424" />
        </linearGradient>
        <linearGradient id="puc-castle-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2410" />
          <stop offset="100%" stopColor="#221408" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="480" height="360" fill="url(#puc-castle-sky)" />

      {/* Ground */}
      <rect x="0" y="320" width="480" height="40" fill="#2d2a26" />

      {/* Castle main body */}
      <rect x="120" y="120" width="240" height="200" fill="url(#puc-castle-stone)" />
      {/* Crenellations */}
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={120 + i * 40} y="110" width="20" height="14" fill="url(#puc-castle-stone)" />
      ))}

      {/* Left tower */}
      <rect x="70" y="80" width="60" height="240" fill="url(#puc-castle-stone)" />
      <polygon points="60,80 100,30 140,80" fill="url(#puc-castle-roof)" />
      <rect x="90" y="160" width="20" height="36" fill="#1b1818" />

      {/* Right tower */}
      <rect x="350" y="80" width="60" height="240" fill="url(#puc-castle-stone)" />
      <polygon points="340,80 380,30 420,80" fill="url(#puc-castle-roof)" />
      <rect x="370" y="160" width="20" height="36" fill="#1b1818" />

      {/* Tower flags */}
      <line x1="100" y1="30" x2="100" y2="10" stroke="#c8b6ff" strokeWidth="1.5" />
      <polygon points="100,10 116,15 100,20" fill="#e7b841" />
      <line x1="380" y1="30" x2="380" y2="10" stroke="#c8b6ff" strokeWidth="1.5" />
      <polygon points="380,10 396,15 380,20" fill="#e7b841" />

      {/* Main arched gate */}
      <path
        d="M 180 320 L 180 220 Q 180 170 240 170 Q 300 170 300 220 L 300 320 Z"
        fill="url(#puc-castle-door)"
        stroke="#0c0805"
        strokeWidth="2"
      />
      {/* Gate plank lines */}
      <line x1="240" y1="170" x2="240" y2="320" stroke="#0c0805" strokeWidth="1.5" opacity="0.7" />
      <line x1="210" y1="190" x2="210" y2="320" stroke="#0c0805" strokeWidth="1" opacity="0.4" />
      <line x1="270" y1="190" x2="270" y2="320" stroke="#0c0805" strokeWidth="1" opacity="0.4" />

      {/* Iron studs */}
      {[200, 230, 260, 290].map((y) =>
        [200, 280].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#0c0805" />
        )),
      )}

      {/* Left wicket — purely decorative, always closed in Phase A */}
      <rect x="195" y="250" width="34" height="60" rx="3" fill="#1a0e05" stroke="#0c0805" strokeWidth="1.5" />
      <circle cx="222" cy="282" r="1.8" fill="#caa14a" />

      {/* Right wicket — animates open per phase */}
      <g
        className={`puc-castle-art__wicket puc-castle-art__wicket--${phase}`}
        style={{ transformOrigin: '252px 282px' }}
      >
        <rect x="252" y="250" width="34" height="60" rx="3" fill="#1a0e05" stroke="#0c0805" strokeWidth="1.5" />
        <circle cx="259" cy="282" r="1.8" fill="#caa14a" />
      </g>

      {/* Glow from inside the wicket once it starts opening */}
      {phase !== 'closed' && (
        <ellipse
          cx="269"
          cy="280"
          rx="14"
          ry="22"
          fill="#f7e8b6"
          opacity={phase === 'open' ? 0.65 : 0.25}
          className="puc-castle-art__glow"
        />
      )}

      {/* Banner with castle initial */}
      <g transform="translate(220, 130)">
        <rect x="0" y="0" width="40" height="44" fill="#7a3e3e" stroke="#3a1818" strokeWidth="1.5" />
        <polygon points="0,44 20,52 40,44" fill="#7a3e3e" stroke="#3a1818" strokeWidth="1.5" />
        <text
          x="20"
          y="28"
          textAnchor="middle"
          fontFamily="Georgia, serif"
          fontSize="20"
          fontWeight="bold"
          fill="#f7e8b6"
        >
          P
        </text>
      </g>
    </svg>
  )
}
