// Single source of truth for badge sanitisation. Used by createTeam
// and by the captain's rebadgeTeam callable so the validation stays
// in sync.
//
// Allows the full slice-4 vocabulary (8 shapes, 8 layouts, 30+
// symbols, optional engraved text) but rejects anything outside it.
// Text is uppercased + restricted to safe characters + profanity-
// filtered against the same list that gates chat messages.

import { scrubMessage } from '../castle/profanity'
import { TEAM_TEXT_MAX, type TeamBadge } from '../castle/types'

const ALLOWED_SHAPES = new Set([
  'shield-heater', 'shield-round', 'shield-pointed', 'roundel',
  'oval', 'kite', 'lozenge', 'heart',
])
const ALLOWED_LAYOUTS = new Set([
  'solid', 'horizontal', 'vertical', 'quartered',
  'bend', 'chevron', 'chief', 'bordure',
])
const ALLOWED_TEXT_POSITIONS = new Set(['none', 'chief', 'base'])
const ALLOWED_SYMBOLS = new Set([
  'king', 'queen', 'rook', 'bishop', 'knight', 'pawn',
  'lion', 'eagle', 'dragon', 'wolf', 'owl', 'fish', 'bear', 'horse',
  'sun', 'moon', 'lightning', 'wave', 'fire', 'oak',
  'crown', 'sword', 'shield', 'axe', 'anchor', 'cross',
  'star', 'diamond', 'heart', 'spiral', 'compass',
])

function colour(s: unknown): string | undefined {
  return typeof s === 'string' && /^#[0-9a-f]{3,8}$/i.test(s) ? s : undefined
}

/** Clean + clamp the user-provided badge text. Returns undefined if
 *  the text shouldn't be persisted (empty, all-stripped, contains
 *  profanity). */
function sanitiseText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  // Strip everything that isn't a letter / digit / space, uppercase
  // the rest. Single space collapse + length cap.
  const stripped = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEAM_TEXT_MAX)
  if (!stripped) return undefined
  // Profanity gate — if the text matches anything in the chat
  // blocklist we drop it rather than censor with asterisks. A shield
  // engraved with "F***" looks worse than just no text.
  const scrub = scrubMessage(stripped)
  if (scrub.censored) return undefined
  return stripped
}

export function sanitiseBadge(raw: TeamBadge | undefined): TeamBadge {
  const defaults: TeamBadge = {
    shape: 'shield-heater',
    layout: 'solid',
    bg: '#3a5b9c',
    border: '#1a1530',
    symbol: 'king',
    symbolColor: '#f4c266',
  }
  if (!raw || typeof raw !== 'object') return defaults

  const shape = typeof raw.shape === 'string' && ALLOWED_SHAPES.has(raw.shape)
    ? raw.shape : defaults.shape
  const layout = typeof raw.layout === 'string' && ALLOWED_LAYOUTS.has(raw.layout)
    ? raw.layout : defaults.layout
  const symbol = typeof raw.symbol === 'string' && ALLOWED_SYMBOLS.has(raw.symbol)
    ? raw.symbol : defaults.symbol
  const textPosition = typeof raw.textPosition === 'string'
    && ALLOWED_TEXT_POSITIONS.has(raw.textPosition)
    ? raw.textPosition : 'none'
  const text = textPosition === 'none' ? undefined : sanitiseText(raw.text)

  return {
    shape,
    layout,
    bg: colour(raw.bg) ?? defaults.bg,
    ...(colour(raw.bg2) ? { bg2: colour(raw.bg2) } : {}),
    border: colour(raw.border) ?? defaults.border,
    symbol,
    symbolColor: colour(raw.symbolColor) ?? defaults.symbolColor,
    // Only persist text + position if we ended up with usable text;
    // otherwise drop both so the doc stays clean.
    ...(text ? { text, textPosition, textColor: colour(raw.textColor) ?? '#f7e8b6' } : {}),
  }
}
