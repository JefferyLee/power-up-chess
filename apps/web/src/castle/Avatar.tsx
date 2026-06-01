// Avatar component — renders the preset SVG art for a given AvatarId.

import type { ReactElement } from 'react'
import { avatarMeta, type AvatarId } from './avatars'

const ART: Record<AvatarId, () => ReactElement> = {
  fox: () => (
    <g>
      <ellipse cx="50" cy="58" rx="32" ry="28" fill="#e87a3a" />
      <polygon points="22,38 30,12 40,32" fill="#e87a3a" />
      <polygon points="78,38 70,12 60,32" fill="#e87a3a" />
      <polygon points="26,36 32,22 36,32" fill="#fff" />
      <polygon points="74,36 68,22 64,32" fill="#fff" />
      <circle cx="40" cy="55" r="3" fill="#1a1208" />
      <circle cx="60" cy="55" r="3" fill="#1a1208" />
      <ellipse cx="50" cy="68" rx="4" ry="3" fill="#1a1208" />
      <path d="M 42 76 Q 50 82 58 76" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 36 62 L 26 60 M 64 62 L 74 60" stroke="#fff" strokeWidth="1.5" />
    </g>
  ),
  owl: () => (
    <g>
      <ellipse cx="50" cy="56" rx="32" ry="34" fill="#7a5a2a" />
      <ellipse cx="50" cy="74" rx="28" ry="14" fill="#a87a3a" />
      <circle cx="38" cy="50" r="11" fill="#fff" />
      <circle cx="62" cy="50" r="11" fill="#fff" />
      <circle cx="38" cy="51" r="6" fill="#1a1208" />
      <circle cx="62" cy="51" r="6" fill="#1a1208" />
      <circle cx="40" cy="49" r="2" fill="#fff" />
      <circle cx="64" cy="49" r="2" fill="#fff" />
      <polygon points="46,62 50,68 54,62" fill="#e8b830" />
      <path d="M 22 26 L 36 38 M 78 26 L 64 38" stroke="#7a5a2a" strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  wolf: () => (
    <g>
      <ellipse cx="50" cy="58" rx="32" ry="30" fill="#6a6a8a" />
      <polygon points="22,38 28,8 42,30" fill="#6a6a8a" />
      <polygon points="78,38 72,8 58,30" fill="#6a6a8a" />
      <circle cx="40" cy="55" r="3" fill="#1a1208" />
      <circle cx="60" cy="55" r="3" fill="#1a1208" />
      <ellipse cx="50" cy="72" rx="6" ry="4" fill="#1a1208" />
      <path d="M 38 78 Q 50 84 62 78" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 30 56 Q 50 36 70 56" stroke="#fff" strokeWidth="1" fill="none" />
    </g>
  ),
  cat: () => (
    <g>
      <ellipse cx="50" cy="58" rx="32" ry="28" fill="#3a2c4a" />
      <polygon points="22,36 28,10 42,30" fill="#3a2c4a" />
      <polygon points="78,36 72,10 58,30" fill="#3a2c4a" />
      <ellipse cx="40" cy="55" rx="3" ry="6" fill="#caf03a" />
      <ellipse cx="60" cy="55" rx="3" ry="6" fill="#caf03a" />
      <polygon points="46,68 50,72 54,68" fill="#f08aa8" />
      <path d="M 42 78 Q 50 82 58 78" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 34 70 L 24 68 M 66 70 L 76 68 M 34 74 L 24 76 M 66 74 L 76 76" stroke="#fff" strokeWidth="1" />
    </g>
  ),
  rabbit: () => (
    <g>
      <ellipse cx="50" cy="62" rx="30" ry="26" fill="#fff" />
      <ellipse cx="40" cy="22" rx="6" ry="18" fill="#fff" />
      <ellipse cx="60" cy="22" rx="6" ry="18" fill="#fff" />
      <ellipse cx="40" cy="24" rx="3" ry="13" fill="#f0a8c0" />
      <ellipse cx="60" cy="24" rx="3" ry="13" fill="#f0a8c0" />
      <circle cx="42" cy="56" r="3" fill="#1a1208" />
      <circle cx="58" cy="56" r="3" fill="#1a1208" />
      <polygon points="48,66 50,72 52,66" fill="#f08aa8" />
      <path d="M 44 74 Q 50 78 56 74" stroke="#1a1208" strokeWidth="1.5" fill="none" />
    </g>
  ),
  dragon: () => (
    <g>
      <ellipse cx="50" cy="58" rx="32" ry="30" fill="#5e8a4a" />
      <polygon points="20,40 14,18 32,32" fill="#3e6a30" />
      <polygon points="80,40 86,18 68,32" fill="#3e6a30" />
      <circle cx="40" cy="55" r="3" fill="#f1c34c" />
      <circle cx="60" cy="55" r="3" fill="#f1c34c" />
      <ellipse cx="50" cy="70" rx="8" ry="5" fill="#1a1208" />
      <polygon points="42,76 44,82 46,76 48,82 50,76 52,82 54,76 56,82 58,76" fill="#fff" />
      <path d="M 30 30 L 36 22 M 70 30 L 64 22 M 50 18 L 50 8" stroke="#3e6a30" strokeWidth="2" />
    </g>
  ),
  unicorn: () => (
    <g>
      <ellipse cx="50" cy="60" rx="30" ry="28" fill="#fff" />
      <polygon points="50,14 46,38 54,38" fill="#f1c34c" />
      <path d="M 20 32 Q 35 18 50 28" stroke="#e8a4d0" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M 80 32 Q 65 18 50 28" stroke="#e8a4d0" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="58" r="3" fill="#1a1208" />
      <circle cx="60" cy="58" r="3" fill="#1a1208" />
      <ellipse cx="50" cy="70" rx="3" ry="2" fill="#f08aa8" />
      <path d="M 44 76 Q 50 80 56 76" stroke="#1a1208" strokeWidth="1.5" fill="none" />
    </g>
  ),
  pirate: () => (
    <g>
      <ellipse cx="50" cy="58" rx="30" ry="30" fill="#f4d8b8" />
      <path d="M 18 36 Q 50 14 82 36 L 78 30 L 50 18 L 22 30 Z" fill="#1a1212" />
      <rect x="44" y="22" width="12" height="4" fill="#a82828" />
      <path d="M 32 50 L 42 55 L 36 60 Z" fill="#1a1212" />
      <circle cx="60" cy="55" r="3" fill="#1a1208" />
      <path d="M 38 70 Q 50 76 62 70" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="55" y="76" width="6" height="4" fill="#caa14a" />
    </g>
  ),
  wizard: () => (
    <g>
      <ellipse cx="50" cy="62" rx="30" ry="28" fill="#f4d8c2" />
      <polygon points="20,38 50,4 80,38" fill="#3a2a78" />
      <polygon points="34,38 50,18 66,38" fill="#5e4ac8" />
      <circle cx="50" cy="18" r="3" fill="#f1c34c" />
      <ellipse cx="42" cy="58" rx="3" ry="4" fill="#1a1208" />
      <ellipse cx="58" cy="58" rx="3" ry="4" fill="#1a1208" />
      <path d="M 40 74 Q 50 80 60 74" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 30 78 Q 50 96 70 78" stroke="#fff" strokeWidth="3" fill="none" />
    </g>
  ),
  knight: () => (
    <g>
      <path d="M 32 84 L 30 50 Q 30 28 50 22 Q 70 28 70 50 L 68 84 Z" fill="#c8c8d8" />
      <path d="M 34 50 L 50 30 L 66 50 L 66 60 L 34 60 Z" fill="#888898" />
      <rect x="42" y="50" width="16" height="6" fill="#1a1208" />
      <rect x="44" y="40" width="4" height="6" fill="#1a1208" />
      <rect x="52" y="40" width="4" height="6" fill="#1a1208" />
      <polygon points="50,14 46,22 54,22" fill="#a82828" />
      <path d="M 38 62 L 30 70 M 62 62 L 70 70" stroke="#888898" strokeWidth="4" />
    </g>
  ),
  queen: () => (
    <g>
      <ellipse cx="50" cy="62" rx="30" ry="28" fill="#f4d8c2" />
      <polygon points="20,38 30,16 36,30 50,12 64,30 70,16 80,38" fill="#caa14a" />
      <circle cx="30" cy="16" r="2.5" fill="#a82828" />
      <circle cx="50" cy="12" r="3" fill="#3a8aa8" />
      <circle cx="70" cy="16" r="2.5" fill="#a82828" />
      <circle cx="42" cy="58" r="3" fill="#1a1208" />
      <circle cx="58" cy="58" r="3" fill="#1a1208" />
      <path d="M 42 74 Q 50 80 58 74" stroke="#a82828" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  star: () => (
    <g>
      <polygon
        points="50,12 60,38 88,40 66,58 74,86 50,70 26,86 34,58 12,40 40,38"
        fill="#f6e3a1"
        stroke="#a87a18"
        strokeWidth="2"
      />
      <circle cx="42" cy="50" r="2.5" fill="#1a1208" />
      <circle cx="58" cy="50" r="2.5" fill="#1a1208" />
      <path d="M 42 60 Q 50 66 58 60" stroke="#1a1208" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
}

interface Props {
  avatarId: AvatarId
  size?: number
  className?: string
}

export function Avatar({ avatarId, size = 64, className }: Props) {
  const meta = avatarMeta(avatarId)
  const draw = ART[avatarId] ?? ART.star
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={meta.label}
    >
      <circle cx="50" cy="50" r="50" fill={meta.bg} />
      {draw()}
    </svg>
  )
}
