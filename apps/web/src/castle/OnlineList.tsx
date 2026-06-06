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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCastle } from './useCastle'
import { InviteDialog } from '../invitations/InviteDialog'
import { INVITE_COST_CP } from '../invitations/types'
import { useUserCard } from '../invitations/UserCardHost'
import { useLobbyPresence, type LocationTag, type PresenceRow } from './useLobbyChat'
import { countryFlag } from '../me/origin'
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
  const { identity } = useCastle()
  const userCard = useUserCard()
  /** Shortcut: clicking the inline ✦ icon opens InviteDialog directly,
   *  skipping the User Card. Kid power-user move. */
  const [quickInviteRow, setQuickInviteRow] = useState<PresenceRow | null>(null)

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
            onNameClick={(normalizedName) => {
              if (!normalizedName) return // bypass guests have no normalizedName
              userCard.open(normalizedName)
            }}
            onQuickInvite={(row) => setQuickInviteRow(row)}
            selfCanInvite={
              !!identity
              && !identity.isBypass
              && (identity.castlePoints ?? 0) >= INVITE_COST_CP
            }
          />
        ))}
      </ul>
      {quickInviteRow && identity && (
        <InviteDialog
          toNormalizedName={quickInviteRow.normalizedName}
          toDisplayName={quickInviteRow.displayName}
          selfNormalizedName={identity.normalizedName}
          onClose={() => setQuickInviteRow(null)}
          onSent={() => setQuickInviteRow(null)}
        />
      )}
    </aside>
  )
}

function OnlineRow({
  row,
  isYou,
  onNav,
  onNameClick,
  onQuickInvite,
  selfCanInvite,
}: {
  row: PresenceRow
  isYou: boolean
  onNav: (href: string) => void
  onNameClick: (normalizedName: string) => void
  onQuickInvite: (row: PresenceRow) => void
  selfCanInvite: boolean
}) {
  const view = viewFor(row.location)
  const cosmetic = row.hasTournamentCrown
    ? { icon: '🏆', title: 'Weekly Tournament champion — last 7 days' }
    : row.hasCrown
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
        (row.hasTournamentCrown
          ? ' puc-online__row--tcrown'
          : row.hasCrown
            ? ' puc-online__row--crown'
            : row.hasHalo
              ? ' puc-online__row--halo'
              : '')
      }
    >
      <button
        type="button"
        className="puc-online__name puc-online__name--clickable"
        onClick={() => onNameClick(row.normalizedName)}
        disabled={row.isBypass || !row.normalizedName}
        title={row.isBypass ? 'Anonymous guest — no profile to view' : `View ${row.displayName}'s profile`}
      >
        {row.isBypass ? '👻 ' : ''}
        {cosmetic && (
          <span className="puc-online__cosmetic" title={cosmetic.title}>
            {cosmetic.icon}
          </span>
        )}
        {row.country && (
          <span className="puc-online__flag" title={row.country} aria-hidden="true">
            {countryFlag(row.country)}
          </span>
        )}
        {row.displayName}
        {row.title && <span className="puc-online__rank"> · {row.title}</span>}
        {isYou ? ' (you)' : ''}
        {row.todaysFive && <MiniTodaysFive results={row.todaysFive} />}
      </button>
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
      {/* Inline quick-invite. Skips the User Card — for repeat invites
       *  where you already know who they are. Hidden when:
       *  - row is yourself / a bypass guest with no normalizedName
       *  - row is already in a chess/wizard game
       *  - you can't afford the 5 CP / are a bypass guest yourself */}
      {!isYou && !row.isBypass && row.normalizedName
        && view.variant !== 'chess' && view.variant !== 'wizard' && (
        <button
          type="button"
          className="puc-online__invite"
          onClick={() => onQuickInvite(row)}
          disabled={!selfCanInvite}
          title={
            selfCanInvite
              ? `Invite ${row.displayName} to a chess game (5 ✦)`
              : `Need 5 castle points to send an invite.`
          }
          aria-label={`Invite ${row.displayName}`}
        >
          ✦
        </button>
      )}
    </li>
  )
}

/** Inline 5-segment HP bar — same semantics as the Adventurer's
 *  Plaque, just denser. Green=solved, red=failed, dim=pending.
 *  Tooltip surfaces the exact tally. */
function MiniTodaysFive({ results }: { results: Array<boolean | null> }) {
  const slots = results.length === 5 ? results : [null, null, null, null, null]
  const solved = slots.filter((r) => r === true).length
  const attempted = slots.filter((r) => r !== null).length
  const allDone = attempted === 5
  return (
    <span
      className={'puc-online__tfbar' + (allDone ? ' puc-online__tfbar--full' : '')}
      title={`Today's Five: ${solved} solved, ${attempted}/5 attempted`}
      aria-label={`Today's Five: ${solved} of ${attempted} attempted`}
    >
      {slots.map((r, i) => (
        <span
          key={i}
          className={
            'puc-online__tfseg ' +
            (r === true
              ? 'puc-online__tfseg--hit'
              : r === false
                ? 'puc-online__tfseg--miss'
                : 'puc-online__tfseg--pending')
          }
        />
      ))}
    </span>
  )
}
