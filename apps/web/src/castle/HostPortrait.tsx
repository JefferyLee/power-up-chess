// Placeholder host portrait — stylised SVG silhouette per MVP2_PLAN §10.5.
// Real anime art will replace this in a later asset drop.
//
// Two color schemes, one per host. The frame uses the host's accent
// gradient so the portrait sits naturally in the matching theme.

import type { HostId } from '../hosts/hosts'

interface Props {
  hostId: HostId
  variant?: 'lobby' | 'chip'
}

export function HostPortrait({ hostId, variant = 'lobby' }: Props) {
  const isLucy = hostId === 'lucy'
  const palette = isLucy
    ? {
        bg1: '#e7b841',
        bg2: '#7a4a1a',
        skin: '#f5d3b5',
        hair: '#3a2410',
        accent: '#5e7a4b',
        clothes: '#a45e3a',
      }
    : {
        bg1: '#c8b6ff',
        bg2: '#3b2a78',
        skin: '#ecd6c5',
        hair: '#1a1432',
        accent: '#8d6fd9',
        clothes: '#2c2853',
      }
  const size = variant === 'chip' ? 44 : 200

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={`puc-portrait puc-portrait--${variant}`}
      role="img"
      aria-label={isLucy ? 'Lucy, host' : 'Luca, host'}
    >
      <defs>
        <radialGradient id={`puc-portrait-bg-${hostId}`} cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor={palette.bg1} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.bg2} stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="98" fill={`url(#puc-portrait-bg-${hostId})`} stroke={palette.accent} strokeWidth="3" />
      {/* Hair backdrop */}
      <ellipse cx="100" cy="92" rx="56" ry="60" fill={palette.hair} />
      {/* Face */}
      <ellipse cx="100" cy="100" rx="42" ry="50" fill={palette.skin} />
      {/* Eyes */}
      <ellipse cx="86" cy="98" rx="3.5" ry="5" fill={palette.hair} />
      <ellipse cx="114" cy="98" rx="3.5" ry="5" fill={palette.hair} />
      {/* Cheek hint */}
      <circle cx="80" cy="115" r="6" fill={palette.bg1} opacity="0.35" />
      <circle cx="120" cy="115" r="6" fill={palette.bg1} opacity="0.35" />
      {/* Smile */}
      <path d="M 88 122 Q 100 132 112 122" stroke={palette.hair} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Hair tuft */}
      {isLucy ? (
        <path d="M 58 70 Q 100 38 142 70 Q 130 56 100 50 Q 70 56 58 70 Z" fill={palette.hair} />
      ) : (
        <path d="M 60 76 Q 100 40 140 76 L 130 60 L 110 50 L 90 50 L 70 60 Z" fill={palette.hair} />
      )}
      {/* Shoulders / clothes */}
      <path d="M 30 200 Q 30 160 60 150 L 140 150 Q 170 160 170 200 Z" fill={palette.clothes} />
      {/* Collar accent */}
      <path d="M 80 150 L 100 168 L 120 150 Z" fill={palette.accent} />
    </svg>
  )
}
