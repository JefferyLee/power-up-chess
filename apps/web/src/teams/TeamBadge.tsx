// Heraldic badge SVG renderer. Used by team badges + (slice 4b) user
// avatars. Config-driven: 8 shield shapes, 8 layout divisions, 16
// colours, 30+ symbols, plus optional chief / base text engraving.
//
// Backward-compatible with the pre-slice-4 four-shape, four-layout
// config — unknown ids fall through to sensible defaults.

import { useId } from 'react'
import type { TeamBadge as BadgeConfig } from '../firebase/callables'

interface Props {
  badge: BadgeConfig | undefined
  size?: number
  className?: string
  /** When true the badge ignores text fields. Avatars use this. */
  hideText?: boolean
}

const DEFAULT_BG = '#3a5b9c'
const DEFAULT_BORDER = '#1a1530'
const DEFAULT_SYMBOL_COLOR = '#f4c266'

/** Shield outline paths drawn for a 100×100 viewBox. */
export const SHAPE_PATHS: Record<string, string> = {
  'shield-heater': 'M 50 4 L 92 14 L 92 50 Q 92 80 50 96 Q 8 80 8 50 L 8 14 Z',
  'shield-round': 'M 50 4 L 92 14 L 92 56 Q 92 96 50 96 Q 8 96 8 56 L 8 14 Z',
  'shield-pointed': 'M 50 2 L 94 12 L 92 54 L 50 98 L 8 54 L 6 12 Z',
  'roundel': 'M 50 50 m -46 0 a 46 46 0 1 0 92 0 a 46 46 0 1 0 -92 0',
  'oval': 'M 50 2 a 40 48 0 1 0 0 96 a 40 48 0 1 0 0 -96',
  'kite': 'M 50 4 L 94 50 L 50 96 L 6 50 Z',
  'lozenge': 'M 50 8 L 88 50 L 50 92 L 12 50 Z',
  'heart': 'M 50 96 C 5 60 5 18 30 14 C 42 12 50 22 50 30 C 50 22 58 12 70 14 C 95 18 95 60 50 96 Z',
}

export const SHAPE_IDS = Object.keys(SHAPE_PATHS)

/** Symbol palette. Each entry returns an SVG node centred in the 100
 *  viewBox. Mix of chess-unicode (precise glyphs) and emoji (richer
 *  visuals for animals / nature). */
export const SYMBOLS: Record<string, (color: string) => React.ReactNode> = {
  // Chess pieces
  king:   (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♚</text>,
  queen:  (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♛</text>,
  rook:   (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♜</text>,
  bishop: (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♝</text>,
  knight: (c) => <text x="50" y="70" textAnchor="middle" fontSize="58" fontFamily="serif" fill={c}>♞</text>,
  pawn:   (c) => <text x="50" y="70" textAnchor="middle" fontSize="58" fontFamily="serif" fill={c}>♟</text>,
  // Animals (emoji — keeps the visual style consistent with chat / app)
  lion:    (_) => <text x="50" y="72" textAnchor="middle" fontSize="56">🦁</text>,
  eagle:   (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🦅</text>,
  dragon:  (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🐉</text>,
  wolf:    (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🐺</text>,
  owl:     (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🦉</text>,
  fish:    (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🐟</text>,
  bear:    (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🐻</text>,
  horse:   (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🐴</text>,
  // Nature
  sun:     (_) => <text x="50" y="72" textAnchor="middle" fontSize="56">☀️</text>,
  moon:    (_) => <text x="50" y="74" textAnchor="middle" fontSize="48">🌙</text>,
  lightning:(_) => <text x="50" y="72" textAnchor="middle" fontSize="56">⚡</text>,
  wave:    (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🌊</text>,
  fire:    (_) => <text x="50" y="74" textAnchor="middle" fontSize="56">🔥</text>,
  oak:     (_) => <text x="50" y="74" textAnchor="middle" fontSize="56">🌳</text>,
  // Heraldic
  crown:   (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">👑</text>,
  sword:   (_) => <text x="50" y="72" textAnchor="middle" fontSize="56">⚔️</text>,
  shield:  (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🛡️</text>,
  axe:     (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">🪓</text>,
  anchor:  (_) => <text x="50" y="72" textAnchor="middle" fontSize="52">⚓</text>,
  cross:   (c) => (
    <g fill={c}>
      <rect x="44" y="20" width="12" height="60" />
      <rect x="20" y="44" width="60" height="12" />
    </g>
  ),
  // Abstract
  star:    (c) => <text x="50" y="70" textAnchor="middle" fontSize="60" fill={c}>★</text>,
  diamond: (c) => <path d="M 50 18 L 80 50 L 50 82 L 20 50 Z" fill={c} />,
  heart:   (c) => <text x="50" y="74" textAnchor="middle" fontSize="56" fill={c}>♥</text>,
  spiral:  (c) => (
    <path
      d="M 50 50 m -22 0 a 22 22 0 1 0 44 0 a 22 22 0 1 0 -34 -2 a 14 14 0 1 0 24 0 a 9 9 0 1 0 -14 0"
      fill="none"
      stroke={c}
      strokeWidth="4"
    />
  ),
  // Compass / wayfinder
  compass: (c) => (
    <g fill={c}>
      <path d="M 50 16 L 56 50 L 50 84 L 44 50 Z" />
      <path d="M 16 50 L 50 44 L 84 50 L 50 56 Z" opacity="0.6" />
    </g>
  ),
}

export const SYMBOL_IDS = Object.keys(SYMBOLS)

/** 16-colour heraldic palette. */
export const PALETTE = [
  '#3a5b9c', '#1a2a5c', '#3a8a9c', '#4ac2c2',  // blues / teals
  '#9c3a3a', '#6b1a1a', '#a14a8c', '#7c3a9c',  // reds / purples
  '#3a9c5b', '#1a5b2a', '#c2a44a', '#9c7c3a',  // greens / golds
  '#2a2a4a', '#1a1a2a', '#d8d8e0', '#ef9a3f',  // dark / light / orange
] as const

export const TEXT_POSITIONS = ['none', 'chief', 'base'] as const

/** Renders the badge SVG. */
export function TeamBadge({ badge, size = 64, className, hideText }: Props) {
  const localId = useId().replace(/[:]/g, '')
  const shape = badge?.shape && SHAPE_PATHS[badge.shape] ? badge.shape : 'shield-heater'
  const layout = badge?.layout ?? 'solid'
  const bg = badge?.bg ?? DEFAULT_BG
  const bg2 = badge?.bg2 ?? bg
  const border = badge?.border ?? DEFAULT_BORDER
  const symbolId = badge?.symbol && SYMBOLS[badge.symbol] ? badge.symbol : 'king'
  const symbolColor = badge?.symbolColor ?? DEFAULT_SYMBOL_COLOR
  const text = !hideText && badge?.text ? badge.text.slice(0, 12) : ''
  const textPosition = (!hideText && badge?.textPosition) || 'none'
  const textColor = badge?.textColor ?? '#f7e8b6'

  const clipId = `puc-tbclip-${localId}`
  const shapePath = SHAPE_PATHS[shape]!
  const renderSymbol = SYMBOLS[symbolId]!

  // Reserve a base ribbon area if text is positioned there. The full
  // viewBox is 100; ribbon takes ~14px height below the shield.
  const hasBaseText = text && textPosition === 'base'
  const viewBoxHeight = hasBaseText ? 114 : 100

  return (
    <svg
      width={size}
      height={size * (viewBoxHeight / 100)}
      viewBox={`0 0 100 ${viewBoxHeight}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shapePath} />
        </clipPath>
      </defs>

      {/* Background — one of eight layout divisions, clipped to the
          shield outline. */}
      <g clipPath={`url(#${clipId})`}>
        {renderBackground(layout, bg, bg2)}
        {/* Symbol sits centred in the 100x100 shield space, shifted
            slightly down when chief text is shown so it doesn't crowd
            the band. */}
        <g transform={text && textPosition === 'chief' ? 'translate(0, 5)' : undefined}>
          {renderSymbol(symbolColor)}
        </g>
        {/* Chief text band — colored stripe across the top with text. */}
        {text && textPosition === 'chief' && (
          <>
            <rect x="0" y="0" width="100" height="18" fill="rgba(0,0,0,0.45)" />
            <text
              x="50"
              y="13.5"
              textAnchor="middle"
              fontSize="11"
              fontFamily="'Cinzel', Georgia, serif"
              fontWeight="700"
              fill={textColor}
              letterSpacing="0.5"
            >
              {text}
            </text>
          </>
        )}
      </g>

      {/* Border traced along the shape outline. */}
      <path
        d={shapePath}
        fill="none"
        stroke={border}
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Base ribbon — sits BELOW the shield in the extended viewBox.
          Drawn as a scroll-like horizontal band. */}
      {text && textPosition === 'base' && (
        <g>
          <path
            d="M 6 100 L 94 100 L 96 108 L 92 112 L 8 112 L 4 108 Z"
            fill={border}
            stroke={border}
            strokeWidth="0.5"
          />
          <text
            x="50"
            y="108.5"
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="'Cinzel', Georgia, serif"
            fontWeight="700"
            fill={textColor}
            letterSpacing="0.4"
          >
            {text}
          </text>
        </g>
      )}
    </svg>
  )
}

function renderBackground(
  layout: NonNullable<BadgeConfig['layout']>,
  bg: string,
  bg2: string,
): React.ReactNode {
  switch (layout) {
    case 'solid':
      return <rect x="0" y="0" width="100" height="100" fill={bg} />
    case 'horizontal':
      return (
        <>
          <rect x="0" y="0" width="100" height="50" fill={bg} />
          <rect x="0" y="50" width="100" height="50" fill={bg2} />
        </>
      )
    case 'vertical':
      return (
        <>
          <rect x="0" y="0" width="50" height="100" fill={bg} />
          <rect x="50" y="0" width="50" height="100" fill={bg2} />
        </>
      )
    case 'quartered':
      return (
        <>
          <rect x="0" y="0" width="50" height="50" fill={bg} />
          <rect x="50" y="0" width="50" height="50" fill={bg2} />
          <rect x="0" y="50" width="50" height="50" fill={bg2} />
          <rect x="50" y="50" width="50" height="50" fill={bg} />
        </>
      )
    case 'bend':
      // Diagonal split top-left to bottom-right
      return (
        <>
          <rect x="0" y="0" width="100" height="100" fill={bg} />
          <path d="M 0 100 L 100 100 L 100 0 Z" fill={bg2} />
        </>
      )
    case 'chevron':
      // V-shape from bottom center to top corners
      return (
        <>
          <rect x="0" y="0" width="100" height="100" fill={bg} />
          <path d="M 0 100 L 50 40 L 100 100 Z" fill={bg2} />
        </>
      )
    case 'chief':
      // Top stripe (top 32%) is bg2; rest is bg
      return (
        <>
          <rect x="0" y="0" width="100" height="32" fill={bg2} />
          <rect x="0" y="32" width="100" height="68" fill={bg} />
        </>
      )
    case 'bordure':
      // Outer ring of bg2; inner fill of bg
      return (
        <>
          <rect x="0" y="0" width="100" height="100" fill={bg2} />
          <rect x="10" y="10" width="80" height="80" fill={bg} />
        </>
      )
    default:
      return <rect x="0" y="0" width="100" height="100" fill={bg} />
  }
}
