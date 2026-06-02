// OnlineList — flat list of everyone online, anywhere in the castle.
//
// Each row carries the person's display name, current location chip,
// and an action button:
//   • Chess / Wizard room → "▸ Watch" navigates the visitor in as a
//     spectator (Firestore room doc is shared, so they see live moves).
//   • Solo activities (puzzle plot, Forest, Practice, …) → "→ Join"
//     navigates to the same screen — won't see the other kid's session,
//     but ends up in the same activity, which is the user's intent.
//   • Hall (or you) → no button.
//
// Sort: you first, then by most-recent heartbeat.

import { useNavigate } from 'react-router-dom'
import { useLobbyPresence, type LocationTag, type PresenceRow } from './useLobbyChat'
import './OnlineList.css'

interface LocationView {
  /** Short label shown in the chip. */
  label: string
  /** Visual variant key. */
  variant: 'hall' | 'chess' | 'wizard' | 'puzzle' | 'practice' | 'local' | 'forest'
  /** Action — undefined if there's no meaningful place to send the
   *  viewer (hall, or your own row). */
  action?: { href: string; label: '▸ Watch' | '→ Join' }
}

const PLOT_LABELS: Record<string, string> = {
  mate: 'Mate Meadow',
  fork: 'Fork Grove',
  pinSkewer: 'Pin & Skewer',
  sacrifice: 'Sacrifice',
  endgame: 'Endgame Pond',
  defense: "Defender's Thicket",
}

function viewFor(loc: LocationTag | undefined): LocationView {
  if (!loc || loc.kind === 'hall') {
    return { label: 'in the Hall', variant: 'hall' }
  }
  switch (loc.kind) {
    case 'chess':
      return {
        label: `Chess · ${loc.roomId}`,
        variant: 'chess',
        action: { href: `/r/${loc.roomId}`, label: '▸ Watch' },
      }
    case 'wizard':
      return {
        label: `Wizard's Duel · ${loc.roomId}`,
        variant: 'wizard',
        action: { href: `/wizard/${loc.roomId}`, label: '▸ Watch' },
      }
    case 'puzzle-garden':
      return {
        label: 'Puzzle Garden',
        variant: 'puzzle',
        action: { href: '/puzzles', label: '→ Join' },
      }
    case 'puzzle-plot':
      return {
        label: PLOT_LABELS[loc.plot] ?? `Plot · ${loc.plot}`,
        variant: 'puzzle',
        action: { href: `/puzzles/plot/${loc.plot}`, label: '→ Join' },
      }
    case 'puzzle-daily':
      return {
        label: "Today's Five",
        variant: 'puzzle',
        action: { href: '/puzzles/daily', label: '→ Join' },
      }
    case 'puzzle-legends':
      return {
        label: 'Legends Hall',
        variant: 'puzzle',
        action: { href: '/puzzles/legends', label: '→ Join' },
      }
    case 'puzzle-calibration':
      return { label: 'Calibrating', variant: 'puzzle' }
    case 'puzzle-leaderboard':
      return {
        label: 'Trophies',
        variant: 'puzzle',
        action: { href: '/puzzles/leaderboard', label: '→ Join' },
      }
    case 'practice':
      return {
        label: 'Practice vs AI',
        variant: 'practice',
        action: { href: '/ai', label: '→ Join' },
      }
    case 'local':
      return {
        label: 'Local Chess',
        variant: 'local',
        action: { href: '/local', label: '→ Join' },
      }
    case 'forest':
      return {
        label: 'Forest',
        variant: 'forest',
        action: { href: '/forest', label: '→ Join' },
      }
  }
}

export function OnlineList({ youUid }: { youUid: string | null }) {
  const navigate = useNavigate()
  const rows = useLobbyPresence()

  // Sort: you first, then most recently seen.
  const sorted = [...rows].sort((a, b) => {
    if (a.uid === youUid && b.uid !== youUid) return -1
    if (b.uid === youUid && a.uid !== youUid) return 1
    return b.lastSeenAt - a.lastSeenAt
  })

  return (
    <aside className="puc-online">
      <h3 className="puc-online__title">Online ({sorted.length})</h3>
      {sorted.length === 0 && (
        <p className="puc-online__empty">just you for now</p>
      )}
      <ul className="puc-online__list">
        {sorted.map((p) => (
          <OnlineRow
            key={p.sessionId}
            row={p}
            isYou={p.uid === youUid}
            onNav={(href) => navigate(href)}
          />
        ))}
      </ul>
    </aside>
  )
}

function OnlineRow({
  row,
  isYou,
  onNav,
}: {
  row: PresenceRow
  isYou: boolean
  onNav: (href: string) => void
}) {
  const view = viewFor(row.location)
  const cosmetic = row.hasCrown
    ? { icon: '🔥', title: '3+ duel wins in a row — last 72h' }
    : row.hasHalo
      ? { icon: '✨', title: 'Duel winner — last 24h' }
      : null
  const showAction = !!view.action && !isYou
  return (
    <li
      className={
        'puc-online__row' +
        (isYou ? ' puc-online__row--you' : '') +
        (row.hasCrown
          ? ' puc-online__row--crown'
          : row.hasHalo
            ? ' puc-online__row--halo'
            : '')
      }
    >
      <span className="puc-online__name">
        {row.isBypass ? '👻 ' : ''}
        {cosmetic && (
          <span className="puc-online__cosmetic" title={cosmetic.title}>
            {cosmetic.icon}
          </span>
        )}
        {row.displayName}
        {row.title && <span className="puc-online__rank"> · {row.title}</span>}
        {isYou ? ' (you)' : ''}
      </span>
      <span
        className={`puc-online__loc puc-online__loc--${view.variant}`}
        title={view.label}
      >
        {view.label}
      </span>
      {showAction && view.action && (
        <button
          type="button"
          className="puc-online__follow"
          onClick={() => onNav(view.action!.href)}
          title={`${view.action.label} ${row.displayName} in ${view.label}`}
        >
          {view.action.label}
        </button>
      )}
    </li>
  )
}
