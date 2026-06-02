// Power Up Castle — large illustrated gate, painted in SVG.
//
// Full-bleed scene that fills the page: a deep dusk sky with constellations,
// distant hills, four towers, banners, lit windows, a wide arched main gate
// with iron bands, two embedded wickets (the right one animates open), a
// stone bridge over a moat, and a pair of wall-mounted lanterns.
//
// The whole thing is one viewBox so it scales cleanly. Theme tokens aren't
// applied here — the gate is intentionally neutral until the visitor enters.

interface Props {
  phase: 'closed' | 'opening' | 'open'
}

export function CastleArt({ phase }: Props) {
  return (
    <svg
      viewBox="0 0 960 720"
      preserveAspectRatio="xMidYMid slice"
      className="puc-castle-art"
      role="img"
      aria-label="Power Up Castle gate"
    >
      <defs>
        {/* Deeper indigo at the zenith → violet middle → warm-ember horizon
         * so the sky feels like real twilight rather than a flat purple. */}
        <linearGradient id="puc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#0d0828" />
          <stop offset="35%" stopColor="#1f1748" />
          <stop offset="65%" stopColor="#3d2c5c" />
          <stop offset="90%" stopColor="#6a4a6a" />
          <stop offset="100%" stopColor="#92543a" />
        </linearGradient>
        {/* Soft halo around the moon — separate from the moon body so the
         * crescent shape can sit cleanly on top. */}
        <radialGradient id="puc-moon-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(255, 245, 200, 0.5)" />
          <stop offset="60%" stopColor="rgba(255, 220, 160, 0.18)" />
          <stop offset="100%" stopColor="rgba(255, 200, 130, 0)" />
        </radialGradient>
        {/* Pine silhouette gradient — solid near base, soft fade at top to
         * suggest mist swallowing the canopy. */}
        <linearGradient id="puc-pines-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(20, 16, 36, 0)" />
          <stop offset="60%" stopColor="rgba(20, 16, 36, 0.55)" />
          <stop offset="100%" stopColor="rgba(20, 16, 36, 0.78)" />
        </linearGradient>
        <linearGradient id="puc-pines-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(12, 10, 22, 0.55)" />
          <stop offset="100%" stopColor="rgba(8, 6, 16, 0.95)" />
        </linearGradient>
        {/* Mist bands — soft horizontal washes drifting through the pines. */}
        <linearGradient id="puc-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="rgba(160, 150, 180, 0)" />
          <stop offset="50%" stopColor="rgba(190, 175, 200, 0.18)" />
          <stop offset="100%" stopColor="rgba(160, 150, 180, 0)" />
        </linearGradient>
        {/* Vignette for corner depth — radial darkening centered on the
         * castle, so the gate reads as the focal point. */}
        <radialGradient id="puc-vignette" cx="50%" cy="65%" r="75%">
          <stop offset="40%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.5)" />
        </radialGradient>
        <linearGradient id="puc-hills" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c2540" />
          <stop offset="100%" stopColor="#1a1226" />
        </linearGradient>
        <linearGradient id="puc-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a89786" />
          <stop offset="100%" stopColor="#5d4f44" />
        </linearGradient>
        <linearGradient id="puc-stone-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a6a5c" />
          <stop offset="100%" stopColor="#3d342c" />
        </linearGradient>
        <linearGradient id="puc-roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a2a2a" />
          <stop offset="100%" stopColor="#4d1212" />
        </linearGradient>
        <linearGradient id="puc-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2410" />
          <stop offset="100%" stopColor="#180c04" />
        </linearGradient>
        <radialGradient id="puc-lantern" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,222,140,0.95)" />
          <stop offset="55%" stopColor="rgba(255,180,80,0.45)" />
          <stop offset="100%" stopColor="rgba(255,160,60,0)" />
        </radialGradient>
        <radialGradient id="puc-wicket-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff1c0" />
          <stop offset="60%" stopColor="rgba(255,210,120,0.6)" />
          <stop offset="100%" stopColor="rgba(255,180,90,0)" />
        </radialGradient>
        <pattern id="puc-stone-tex" width="40" height="20" patternUnits="userSpaceOnUse">
          <rect width="40" height="20" fill="transparent" />
          <line x1="0" y1="10" x2="40" y2="10" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
          <line x1="20" y1="0" x2="20" y2="10" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
          <line x1="0" y1="20" x2="0" y2="10" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
          <line x1="40" y1="20" x2="40" y2="10" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
        </pattern>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="960" height="540" fill="url(#puc-sky)" />

      {/* Stars (a few scattered, pseudo-random) */}
      <g fill="#fff" opacity="0.85">
        {STAR_POINTS.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={p[2]} opacity={0.4 + 0.6 * (p[2] / 1.4)} />
        ))}
      </g>

      {/* Moon — crescent: warm halo, full disc, then a cut-out indigo
       *  disc offset to the right to carve the inner curve. */}
      <circle cx="800" cy="115" r="72" fill="url(#puc-moon-halo)" />
      <circle cx="800" cy="115" r="34" fill="#fdf6da" />
      <circle cx="812" cy="111" r="30" fill="#1f1748" />

      {/* Far pine silhouettes — softest layer, sits in the mist behind the
       *  hills. Uneven triangular crowns suggest a dense conifer line. */}
      <path
        d="M 0 480 L 30 410 L 55 470 L 78 395 L 100 460 L 130 420 L 158 480 L 188 415 L 215 470 L 250 400 L 275 465 L 310 425 L 340 475 L 370 405 L 400 470 L 432 420 L 465 478 L 500 410 L 530 472 L 565 415 L 600 475 L 632 408 L 665 470 L 700 420 L 735 478 L 770 405 L 805 472 L 840 418 L 875 478 L 910 410 L 940 470 L 960 440 L 960 540 L 0 540 Z"
        fill="url(#puc-pines-far)"
      />

      {/* Drifting mist bands — three soft horizontal washes through the
       *  forest. Slow CSS animation defined in GateScreen.css makes them
       *  breathe. */}
      <g className="puc-castle-art__mist">
        <rect x="-40" y="430" width="1040" height="55" fill="url(#puc-mist)" />
        <rect x="-40" y="470" width="1040" height="40" fill="url(#puc-mist)" opacity="0.7" />
        <rect x="-40" y="500" width="1040" height="35" fill="url(#puc-mist)" opacity="0.5" />
      </g>

      {/* Distant hills */}
      <path d="M 0 460 Q 200 380 380 440 T 700 420 T 960 460 L 960 540 L 0 540 Z" fill="url(#puc-hills)" />

      {/* Mid-layer pines — darker, sharper, sit between hills and castle. */}
      <path
        d="M 0 530 L 25 470 L 50 525 L 78 460 L 105 528 L 138 465 L 168 530 L 200 470 L 230 522 L 262 460 L 295 528 L 760 528 L 790 465 L 818 530 L 850 470 L 880 525 L 910 460 L 935 528 L 960 510 L 960 600 L 0 600 Z"
        fill="url(#puc-pines-mid)"
      />


      {/* Ground */}
      <rect x="0" y="540" width="960" height="180" fill="#1d1820" />
      <rect x="0" y="540" width="960" height="14" fill="#0d0a14" />

      {/* Moat */}
      <rect x="0" y="600" width="960" height="80" fill="#10121f" />
      <path d="M 0 600 Q 240 612 480 600 T 960 600 L 960 612 L 0 612 Z" fill="rgba(255,255,255,0.08)" />
      <path d="M 0 640 Q 240 632 480 640 T 960 640 L 960 648 L 0 648 Z" fill="rgba(255,255,255,0.05)" />

      {/* Stone bridge over the moat */}
      <rect x="380" y="586" width="200" height="34" fill="url(#puc-stone-dark)" />
      <rect x="380" y="586" width="200" height="34" fill="url(#puc-stone-tex)" />
      <path d="M 410 620 Q 430 600 470 600 T 530 600 Q 550 600 570 620 Z" fill="#0a0815" />

      {/* Outer wall body */}
      <rect x="60" y="320" width="840" height="280" fill="url(#puc-stone)" />
      <rect x="60" y="320" width="840" height="280" fill="url(#puc-stone-tex)" />
      {/* Crenellations along the wall top */}
      {Array.from({ length: 21 }).map((_, i) => (
        <rect key={i} x={60 + i * 40} y="304" width="22" height="20" fill="url(#puc-stone)" />
      ))}

      {/* Left tower */}
      <rect x="40" y="220" width="100" height="380" fill="url(#puc-stone)" />
      <rect x="40" y="220" width="100" height="380" fill="url(#puc-stone-tex)" />
      <polygon points="20,220 90,90 160,220" fill="url(#puc-roof)" />
      <rect x="80" y="320" width="20" height="34" fill="#0e0c12" />
      <rect x="80" y="380" width="20" height="34" fill="#0e0c12" />
      <rect x="80" y="440" width="20" height="34" fill="url(#puc-wicket-glow)" opacity="0.7" />
      {/* Tower crenellations */}
      {Array.from({ length: 3 }).map((_, i) => (
        <rect key={i} x={45 + i * 32} y="208" width="20" height="16" fill="url(#puc-stone)" />
      ))}

      {/* Right tower */}
      <rect x="820" y="220" width="100" height="380" fill="url(#puc-stone)" />
      <rect x="820" y="220" width="100" height="380" fill="url(#puc-stone-tex)" />
      <polygon points="800,220 870,90 940,220" fill="url(#puc-roof)" />
      <rect x="860" y="320" width="20" height="34" fill="#0e0c12" />
      <rect x="860" y="380" width="20" height="34" fill="#0e0c12" />
      <rect x="860" y="440" width="20" height="34" fill="url(#puc-wicket-glow)" opacity="0.7" />
      {Array.from({ length: 3 }).map((_, i) => (
        <rect key={i} x={825 + i * 32} y="208" width="20" height="16" fill="url(#puc-stone)" />
      ))}

      {/* Tower flags — pennants wave around their flagpole edge. The two
       *  flags have slightly different timing offsets so they don't move
       *  in lockstep (left lags right by ~0.4 s). */}
      <line x1="90" y1="90" x2="90" y2="50" stroke="#d0bfff" strokeWidth="2" />
      <g className="puc-castle-art__flag puc-castle-art__flag--left" style={{ transformOrigin: '90px 62px' }}>
        <polygon points="90,50 134,62 90,74" fill="#e7b841" />
      </g>
      <line x1="870" y1="90" x2="870" y2="50" stroke="#d0bfff" strokeWidth="2" />
      <g className="puc-castle-art__flag puc-castle-art__flag--right" style={{ transformOrigin: '870px 62px' }}>
        <polygon points="870,50 914,62 870,74" fill="#e7b841" />
      </g>

      {/* Inner wall — windows. Each glow flickers on a slightly different
       *  cycle (1-4) so the row doesn't pulse in unison. */}
      {([
        [220, 380],
        [280, 380],
        [680, 380],
        [740, 380],
      ] as Array<[number, number]>).map(([x, y], i) => (
        <g key={i}>
          <rect x={x} y={y} width="22" height="40" fill="#0e0c12" />
          <rect
            x={x + 2}
            y={y + 2}
            width="18"
            height="22"
            fill="url(#puc-lantern)"
            opacity="0.85"
            className={`puc-castle-art__window puc-castle-art__window--${(i % 4) + 1}`}
          />
        </g>
      ))}

      {/* Wall-mounted lanterns flanking the gate — both flame circles
       *  flicker at slightly offset rates. */}
      <g>
        <rect x="320" y="430" width="6" height="40" fill="#3a2c20" />
        <circle cx="323" cy="478" r="14" fill="url(#puc-lantern)" className="puc-castle-art__lantern puc-castle-art__lantern--a" />
        <circle cx="323" cy="478" r="5" fill="#ffeec6" className="puc-castle-art__lantern-core puc-castle-art__lantern-core--a" />
      </g>
      <g>
        <rect x="634" y="430" width="6" height="40" fill="#3a2c20" />
        <circle cx="637" cy="478" r="14" fill="url(#puc-lantern)" className="puc-castle-art__lantern puc-castle-art__lantern--b" />
        <circle cx="637" cy="478" r="5" fill="#ffeec6" className="puc-castle-art__lantern-core puc-castle-art__lantern-core--b" />
      </g>

      {/* Wind chimes — small cluster hanging from a horizontal bar tied
       *  to the right-lantern arm. Four rods on staggered swings; the
       *  bar itself sways gently. */}
      <g
        className="puc-castle-art__chimes"
        style={{ transformOrigin: '676px 472px' }}
      >
        {/* Hanger from the lantern arm */}
        <line x1="640" y1="436" x2="676" y2="470" stroke="#3a2c20" strokeWidth="1" />
        {/* Crossbar */}
        <rect x="660" y="470" width="32" height="2.5" rx="1" fill="#6a4a20" />
        {/* Four chime rods + caps. Each rod's <g> rotates around its
         *  attachment point at the crossbar (y=472) with a per-rod
         *  staggered animation. */}
        {[
          { x: 664, len: 18 },
          { x: 671, len: 22 },
          { x: 678, len: 16 },
          { x: 685, len: 20 },
        ].map((rod, i) => (
          <g
            key={i}
            className={`puc-castle-art__chime puc-castle-art__chime--${i + 1}`}
            style={{ transformOrigin: `${rod.x}px 472px` }}
          >
            <circle cx={rod.x} cy={472} r="1.4" fill="#caa14a" />
            <line
              x1={rod.x}
              y1={472}
              x2={rod.x}
              y2={472 + rod.len}
              stroke="#d8b65c"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </g>
        ))}
      </g>

      {/* Main arched gate */}
      <path
        d="M 350 600 L 350 440 Q 350 340 480 340 Q 610 340 610 440 L 610 600 Z"
        fill="url(#puc-door)"
        stroke="#0c0805"
        strokeWidth="3"
      />
      {/* Iron bands */}
      <path d="M 350 460 Q 480 444 610 460" stroke="#1a120a" strokeWidth="6" fill="none" />
      <path d="M 350 520 Q 480 510 610 520" stroke="#1a120a" strokeWidth="6" fill="none" />
      <path d="M 350 580 Q 480 575 610 580" stroke="#1a120a" strokeWidth="6" fill="none" />
      {/* Plank lines */}
      <line x1="480" y1="340" x2="480" y2="600" stroke="#0a0604" strokeWidth="2" opacity="0.7" />
      <line x1="420" y1="370" x2="420" y2="600" stroke="#0a0604" strokeWidth="1" opacity="0.4" />
      <line x1="540" y1="370" x2="540" y2="600" stroke="#0a0604" strokeWidth="1" opacity="0.4" />
      {/* Iron studs */}
      {[400, 440, 480, 520, 560].map((y) =>
        [375, 480, 585].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#0a0604" />),
      )}

      {/* Left wicket — purely decorative, always closed */}
      <g>
        <rect x="380" y="500" width="44" height="92" rx="4" fill="#1c0e05" stroke="#0c0805" strokeWidth="2" />
        <circle cx="416" cy="546" r="2.5" fill="#caa14a" />
      </g>

      {/* Right wicket — animates open per phase, hinged on its right edge */}
      <g
        className={`puc-castle-art__wicket puc-castle-art__wicket--${phase}`}
        style={{ transformOrigin: '579px 546px' }}
      >
        <rect x="535" y="500" width="44" height="92" rx="4" fill="#1c0e05" stroke="#0c0805" strokeWidth="2" />
        <circle cx="544" cy="546" r="2.5" fill="#caa14a" />
        {/* Tiny grille */}
        <line x1="546" y1="520" x2="568" y2="520" stroke="#0a0604" strokeWidth="1" />
        <line x1="546" y1="528" x2="568" y2="528" stroke="#0a0604" strokeWidth="1" />
      </g>

      {/* Warm glow leaking from the open wicket */}
      {phase !== 'closed' && (
        <ellipse
          cx="560"
          cy="546"
          rx="34"
          ry="60"
          fill="url(#puc-wicket-glow)"
          opacity={phase === 'open' ? 0.85 : 0.45}
          className="puc-castle-art__glow"
        />
      )}

      {/* Banner above the gate with castle initial */}
      <g transform="translate(456, 332)">
        <rect x="0" y="0" width="48" height="62" fill="#7a3e3e" stroke="#3a1818" strokeWidth="2" />
        <polygon points="0,62 24,72 48,62" fill="#7a3e3e" stroke="#3a1818" strokeWidth="2" />
        <text
          x="24"
          y="40"
          textAnchor="middle"
          fontFamily="Cinzel, Georgia, serif"
          fontSize="28"
          fontWeight="700"
          fill="#f7e8b6"
        >
          P
        </text>
      </g>

      {/* Fireflies — small drifting glints in front of the foreground.
       *  Each has its own slow loop offset so the cluster pulses
       *  organically. Animation lives in GateScreen.css. */}
      <g className="puc-castle-art__fireflies">
        {FIREFLIES.map((f, i) => (
          <circle
            key={i}
            cx={f.x}
            cy={f.y}
            r={f.r}
            fill="#fff1a8"
            className={`puc-castle-art__firefly puc-castle-art__firefly--${(i % 5) + 1}`}
          />
        ))}
      </g>

      {/* Soft vignette so corners frame the gate as the focal point. */}
      <rect x="0" y="0" width="960" height="720" fill="url(#puc-vignette)" pointerEvents="none" />
    </svg>
  )
}

interface Firefly { x: number; y: number; r: number }

const FIREFLIES: ReadonlyArray<Firefly> = [
  { x:  90, y: 470, r: 1.6 }, { x: 175, y: 510, r: 1.2 }, { x: 250, y: 480, r: 1.8 },
  { x: 320, y: 520, r: 1.0 }, { x: 200, y: 560, r: 1.4 }, { x: 280, y: 590, r: 1.1 },
  { x: 680, y: 480, r: 1.7 }, { x: 750, y: 500, r: 1.3 }, { x: 820, y: 470, r: 1.5 },
  { x: 880, y: 520, r: 1.2 }, { x: 720, y: 555, r: 1.4 }, { x: 800, y: 590, r: 1.0 },
  { x: 380, y: 660, r: 1.3 }, { x: 470, y: 670, r: 1.1 }, { x: 560, y: 660, r: 1.5 },
  { x: 130, y: 640, r: 1.1 }, { x: 850, y: 640, r: 1.2 },
]

// Hand-picked scatter of constellation points — fixed coords so the layout
// stays stable across renders. Format: [x, y, radius].
const STAR_POINTS: Array<[number, number, number]> = [
  [40, 60, 1.0],
  [110, 30, 1.2],
  [180, 90, 0.8],
  [260, 50, 1.0],
  [310, 110, 0.6],
  [360, 40, 0.9],
  [420, 90, 1.1],
  [490, 25, 1.3],
  [520, 130, 0.6],
  [580, 60, 0.8],
  [640, 100, 1.0],
  [710, 50, 1.2],
  [770, 180, 0.7],
  [870, 200, 1.0],
  [910, 60, 1.4],
  [150, 220, 0.6],
  [240, 250, 0.8],
  [330, 200, 0.6],
  [620, 240, 0.6],
  [720, 230, 0.8],
]
