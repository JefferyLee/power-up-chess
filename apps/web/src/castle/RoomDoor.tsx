// RoomDoor — small arched-top "door" tile that links to one Hall
// destination. Replaces the wide card-style buttons. The art is a
// stylised oak door with iron studs, hinges, and a brass knob; the
// label sits under the door, not on it.

interface Props {
  icon: string
  label: string
  blurb: string
  locked?: boolean
  loading?: boolean
  /** When set, overrides the default door color (oak brown). */
  variant?: 'oak' | 'mossy' | 'forest' | 'starry' | 'parchment'
  onClick: () => void
  disabled?: boolean
  title?: string
}

const VARIANT_COLORS: Record<NonNullable<Props['variant']>, [string, string, string]> = {
  // [fill, plank-stroke, frame]
  oak:       ['#3a2410', '#180c04', '#5a3a18'],
  mossy:     ['#264028', '#0c1208', '#3a5a3a'],
  forest:    ['#1f2a18', '#0a0e08', '#3a5028'],
  starry:    ['#1c1338', '#0a061a', '#3a2a78'],
  parchment: ['#7a4a1a', '#3a1c08', '#caa14a'],
}

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
}: Props) {
  const [fill, planks, frame] = VARIANT_COLORS[variant]
  return (
    <button
      type="button"
      className={`puc-roomdoor${locked ? ' puc-roomdoor--locked' : ''}${disabled ? ' puc-roomdoor--disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <svg viewBox="0 0 100 160" className="puc-roomdoor__art" aria-hidden="true">
        <defs>
          <linearGradient id={`puc-door-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity="0.95" />
            <stop offset="100%" stopColor="#0a0604" />
          </linearGradient>
        </defs>
        {/* Stone frame */}
        <path
          d="M 4 158 L 4 50 Q 4 8 50 8 Q 96 8 96 50 L 96 158 Z"
          fill={frame}
          stroke="#0a0604"
          strokeWidth="2"
        />
        {/* Door panel inside */}
        <path
          d="M 14 154 L 14 52 Q 14 16 50 16 Q 86 16 86 52 L 86 154 Z"
          fill={`url(#puc-door-${variant})`}
          stroke={planks}
          strokeWidth="1.5"
        />
        {/* Plank seam down the middle */}
        <line x1="50" y1="16" x2="50" y2="154" stroke={planks} strokeWidth="1" opacity="0.7" />
        {/* Iron bands */}
        <path d="M 14 60 Q 50 52 86 60" stroke="#1a120a" strokeWidth="2.5" fill="none" />
        <path d="M 14 110 Q 50 104 86 110" stroke="#1a120a" strokeWidth="2.5" fill="none" />
        {/* Iron studs */}
        {[40, 90, 140].map((y) =>
          [22, 78].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#0a0604" />),
        )}
        {/* Knob */}
        <circle cx="72" cy="100" r="2.8" fill="#caa14a" stroke="#3a1c08" strokeWidth="0.6" />
        {/* Decoration: icon overlay in a small inset */}
        <g transform="translate(50, 78)">
          <text
            textAnchor="middle"
            fontSize="22"
            fill="#fff6dc"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
          >
            {icon}
          </text>
        </g>
        {/* Lock overlay */}
        {locked && (
          <g transform="translate(50, 130)">
            <rect x="-9" y="-4" width="18" height="14" rx="2" fill="#caa14a" stroke="#1a120a" strokeWidth="1" />
            <path d="M -5 -4 V -10 a 5 5 0 0 1 10 0 V -4" fill="none" stroke="#1a120a" strokeWidth="1.8" />
            <circle cx="0" cy="4" r="2" fill="#1a120a" />
          </g>
        )}
      </svg>
      <span className="puc-roomdoor__label">{loading ? 'Opening…' : label}</span>
      <span className="puc-roomdoor__blurb">{blurb}</span>
    </button>
  )
}
