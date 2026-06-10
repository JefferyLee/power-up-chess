// RoomDoor — a castle-door tile linking to one Hall destination.
//
// The door art is a generated painterly PNG (sandstone arch + carved
// lintel emblem + dark oak + iron hardware + baked hearth light),
// one per destination under /sprites/doors/<iconKey>.png. Only the
// genuinely dynamic bits are drawn as a lightweight SVG overlay on
// top: the waiting-room notice (count changes + sways) and the
// locked padlock. The firelight is baked into the PNG.
//
// When iconKey is absent (or its image hasn't shipped) the door
// falls back to a simple arched tile with the emoji glyph so nothing
// breaks mid-rollout.

interface Props {
  icon: string
  label: string
  blurb: string
  locked?: boolean
  loading?: boolean
  /** Retained for the emoji fallback's tint; the generated door PNGs
   *  bake their own wood colour, so this is unused on the image path. */
  variant?: 'oak' | 'mossy' | 'forest' | 'starry' | 'parchment'
  onClick: () => void
  disabled?: boolean
  title?: string
  /** Count badge — hangs the wooden notice from the door's nail when
   *  present. Use formatRoomCount() to clamp. */
  badge?: string
  badgeTitle?: string
  /** Door art key — selects /sprites/doors/<iconKey>.png. Omit to
   *  fall back to the emoji tile. */
  iconKey?: string
}

const FALLBACK_WOOD: Record<NonNullable<Props['variant']>, string> = {
  oak:       '#3a2410',
  mossy:     '#264028',
  forest:    '#1f2a18',
  starry:    '#1c1338',
  parchment: '#7a4a1a',
}

/** Cache-buster for the door PNGs. These live in /public with stable
 *  filenames (no content hash), so replacing a door's art in place
 *  would otherwise be masked by the service-worker CacheFirst cache
 *  and Cloudflare's edge cache. Bump this whenever any door PNG's
 *  pixels change so every layer treats it as a fresh URL. */
const DOOR_ART_VERSION = '2'

export function RoomDoor({
  icon,
  label,
  blurb,
  locked = false,
  loading = false,
  variant = 'oak',
  onClick,
  disabled = false,
  title,
  badge,
  badgeTitle,
  iconKey,
}: Props) {
  return (
    <button
      type="button"
      className={`puc-roomdoor${locked ? ' puc-roomdoor--locked' : ''}${disabled ? ' puc-roomdoor--disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {/* viewBox 100×150 (2:3) matches the generated door PNG ratio. */}
      <svg viewBox="0 0 100 150" className="puc-roomdoor__art" aria-hidden="true">
        <defs>
          <linearGradient id="puc-roomdoor-sign-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ffe6a5" />
            <stop offset="45%"  stopColor="#f4c266" />
            <stop offset="100%" stopColor="#b8821e" />
          </linearGradient>
        </defs>

        {iconKey ? (
          <image
            href={`/sprites/doors/${iconKey}.png?v=${DOOR_ART_VERSION}`}
            x="0" y="0" width="100" height="150"
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          /* — Emoji fallback: plain arched tile + glyph. — */
          <>
            <path
              d="M 8 148 L 8 48 Q 8 10 50 10 Q 92 10 92 48 L 92 148 Z"
              fill={FALLBACK_WOOD[variant]}
              stroke="#0a0604"
              strokeWidth="1.5"
            />
            <text
              x="50" y="84"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="30"
              fill="#fff6dc"
            >
              {icon}
            </text>
          </>
        )}

        {/* — Firelight flicker — a warm, brightened duplicate of the
         *    door image screen-blended on top of itself. Because it's
         *    the same PNG it shares the exact arch silhouette (no halo,
         *    no mask needed); the CSS filter pushes it warm + bright so
         *    screen-blending makes the lit areas glow, and the opacity
         *    flicker animates the hearth's restless light. */}
        {iconKey && (
          <image
            href={`/sprites/doors/${iconKey}.png?v=${DOOR_ART_VERSION}`}
            x="0" y="0" width="100" height="150"
            preserveAspectRatio="xMidYMid meet"
            className="puc-roomdoor__firelight"
            pointerEvents="none"
          />
        )}

        {/* — Locked padlock — centred on the wood so it doesn't depend
         *    on the baked ring's exact position. The whole tile is also
         *    dimmed via the .puc-roomdoor--locked CSS filter. A locked
         *    door always shows the lock (never the waiting notice) — a
         *    waiting count is irrelevant on a door you can't enter. */}
        {locked && (
          <g transform="translate(50, 96)">
            <rect x="-6" y="-3.5" width="12" height="10" rx="1.2" fill="#241a0f" stroke="#0a0604" strokeWidth="0.7" />
            <path d="M -3.6 -3.5 V -10 a 3.6 3.6 0 0 1 7.2 0 V -3.5" fill="none" stroke="#0a0604" strokeWidth="1.5" />
            <circle cx="0" cy="0.8" r="1" fill="#0a0604" />
            <rect x="-0.45" y="0.8" width="0.9" height="2.3" fill="#0a0604" />
          </g>
        )}

        {/* — Waiting notice — wooden plank hung from the door's nail by
         *    two iron chains converging from the plank's upper corners,
         *    forming a stable triangular suspension. Sways (CSS) about
         *    the nail point. */}
        {badge && !locked && (
          <g className="puc-roomdoor__sign">
            <title>{badgeTitle ?? `${badge} waiting`}</title>
            {/* Whole notice scaled to ~2/3 around the nail point so it
             *  reads as a small plaque on the door rather than a slab.
             *  The nail stays put at (50, 64); everything below shrinks
             *  toward it. Font sizes are pre-bumped so the count stays
             *  legible after the scale. */}
            <g transform="translate(50 64) scale(0.67) translate(-50 -64)">
              {/* Forged nail head at the convergence point (aligns with
               *  the nail baked into the door PNG's upper-centre). */}
              <circle cx="50" cy="64" r="1.8" fill="#100b07" stroke="#000" strokeWidth="0.3" />
              <circle cx="49.3" cy="63.3" r="0.55" fill="rgba(220, 180, 130, 0.45)" />
              {/* Left chain — links from the plank's upper-left corner up
               *  to the nail. */}
              <g stroke="#0a0604" strokeWidth="0.5" fill="none">
                <ellipse cx="42" cy="74.5" rx="1.2" ry="0.7" />
                <ellipse cx="45" cy="71"   rx="0.7" ry="1.2" />
                <ellipse cx="47.5" cy="67.5" rx="1.2" ry="0.7" />
                {/* Right chain — mirror up to the same nail. */}
                <ellipse cx="58" cy="74.5" rx="1.2" ry="0.7" />
                <ellipse cx="55" cy="71"   rx="0.7" ry="1.2" />
                <ellipse cx="52.5" cy="67.5" rx="1.2" ry="0.7" />
              </g>
              {/* Plank */}
              <rect
                x="28" y="76" width="44" height="22" rx="2.5"
                fill="url(#puc-roomdoor-sign-fill)"
                stroke="#3a2208"
                strokeWidth="1.2"
              />
              <circle cx="31" cy="79" r="1" fill="#1a0a02" />
              <circle cx="69" cy="79" r="1" fill="#1a0a02" />
              <text
                x="50" y="89.5"
                textAnchor="middle"
                fontFamily="Cinzel, Georgia, serif"
                fontSize="13"
                fontWeight="800"
                fill="#1f1408"
              >{badge}</text>
              <text
                x="50" y="95"
                textAnchor="middle"
                fontFamily="Cinzel, Georgia, serif"
                fontSize="4.5"
                fontWeight="700"
                fill="#3a2208"
                letterSpacing="0.4"
              >WAITING</text>
            </g>
          </g>
        )}
      </svg>
      <span className="puc-roomdoor__label">{loading ? 'Opening…' : label}</span>
      <span className="puc-roomdoor__blurb">{blurb}</span>
    </button>
  )
}
