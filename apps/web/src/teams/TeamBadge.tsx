// TeamBadge — renders the captain's heraldry-style badge as an SVG.
//
// Stub (Slice 1): a single shield shape, optional horizontal/vertical
// split, single overlay symbol drawn from a tiny built-in set. The
// full builder (Slice 4) expands the symbol palette and adds layout
// choices.

import type { TeamBadge as BadgeConfig } from '../firebase/callables'

interface Props {
  badge: BadgeConfig | undefined
  size?: number
  className?: string
}

const DEFAULT_BG = '#3a5b9c'
const DEFAULT_BORDER = '#1a1530'
const DEFAULT_SYMBOL_COLOR = '#f4c266'

/** Shield outline paths drawn for a 100×100 viewBox. */
const SHAPE_PATHS: Record<string, string> = {
  'shield-heater': 'M 50 4 L 92 14 L 92 50 Q 92 80 50 96 Q 8 80 8 50 L 8 14 Z',
  'shield-round': 'M 50 4 L 92 14 L 92 56 Q 92 96 50 96 Q 8 96 8 56 L 8 14 Z',
  'shield-pointed': 'M 50 2 L 94 12 L 92 54 L 50 98 L 8 54 L 6 12 Z',
  'roundel': 'M 50 50 m -46 0 a 46 46 0 1 0 92 0 a 46 46 0 1 0 -92 0',
}

/** Minimal built-in symbol set. Each is an SVG path or text glyph drawn
 *  inside a 100×100 viewBox; the wrapper fills its viewport. Slice 4
 *  expands this to 30+ entries. */
const SYMBOLS: Record<string, (color: string) => React.ReactNode> = {
  king: (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♚</text>,
  queen: (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♛</text>,
  rook: (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♜</text>,
  bishop: (c) => <text x="50" y="68" textAnchor="middle" fontSize="56" fontFamily="serif" fill={c}>♝</text>,
  knight: (c) => <text x="50" y="70" textAnchor="middle" fontSize="58" fontFamily="serif" fill={c}>♞</text>,
  pawn: (c) => <text x="50" y="70" textAnchor="middle" fontSize="58" fontFamily="serif" fill={c}>♟</text>,
  crown: (c) => <text x="50" y="68" textAnchor="middle" fontSize="50" fill={c}>👑</text>,
  star: (c) => <text x="50" y="70" textAnchor="middle" fontSize="60" fill={c}>★</text>,
  fire: (c) => <text x="50" y="74" textAnchor="middle" fontSize="60" fill={c}>🔥</text>,
  lion: (c) => <text x="50" y="74" textAnchor="middle" fontSize="60" fill={c}>🦁</text>,
}

export function TeamBadge({ badge, size = 64, className }: Props) {
  const shape = badge?.shape && SHAPE_PATHS[badge.shape] ? badge.shape : 'shield-heater'
  const layout = badge?.layout ?? 'solid'
  const bg = badge?.bg ?? DEFAULT_BG
  const bg2 = badge?.bg2 ?? bg
  const border = badge?.border ?? DEFAULT_BORDER
  const symbol = badge?.symbol && SYMBOLS[badge.symbol] ? badge.symbol : 'king'
  const symbolColor = badge?.symbolColor ?? DEFAULT_SYMBOL_COLOR

  const clipId = `puc-tbclip-${shape}-${useId()}`
  const renderSymbol = SYMBOLS[symbol]!

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHAPE_PATHS[shape]!} />
        </clipPath>
      </defs>
      {/* Background — solid or split. */}
      <g clipPath={`url(#${clipId})`}>
        {layout === 'solid' && <rect x="0" y="0" width="100" height="100" fill={bg} />}
        {layout === 'horizontal' && (
          <>
            <rect x="0" y="0" width="100" height="50" fill={bg} />
            <rect x="0" y="50" width="100" height="50" fill={bg2} />
          </>
        )}
        {layout === 'vertical' && (
          <>
            <rect x="0" y="0" width="50" height="100" fill={bg} />
            <rect x="50" y="0" width="50" height="100" fill={bg2} />
          </>
        )}
        {layout === 'quartered' && (
          <>
            <rect x="0" y="0" width="50" height="50" fill={bg} />
            <rect x="50" y="0" width="50" height="50" fill={bg2} />
            <rect x="0" y="50" width="50" height="50" fill={bg2} />
            <rect x="50" y="50" width="50" height="50" fill={bg} />
          </>
        )}
        {renderSymbol(symbolColor)}
      </g>
      {/* Border traced along the shape outline. */}
      <path
        d={SHAPE_PATHS[shape]!}
        fill="none"
        stroke={border}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Small unique id helper — React's useId requires React 18+. Locally
// generated id is fine here (only consumed inside the same SVG).
import { useId } from 'react'
